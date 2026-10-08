/** K6 - analytics overview and Réunions cockpit against a real PostgreSQL
 *  (skipped without DATABASE_URL). Seeds its own dossiers and only looks at
 *  them, so it runs on a database that holds other data too. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const DAY = 86_400_000;

describe('K6 meeting follow-ups (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let analytics: typeof import('./analytics.service.js');
  let meetingsService: typeof import('../meetings/meetings.service.js');
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    analytics = await import('./analytics.service.js');
    meetingsService = await import('../meetings/meetings.service.js');
    const dbModule = await import('../../shared/db/index.js');
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function user(name: string) {
    const code = `K6${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, $2, $3) RETURNING id`, [
      code,
      name,
      `${code}@test.local`,
    ])).id as number;
  }

  async function dossier(status: string) {
    const k = `${tag}-${++n}`;
    const org = await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id, name`,
      [`OMA K6 ${k}`]
    );
    const applicant = await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`,
      [org.id, `p-${k}@test.local`]
    );
    const request = await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id, reference`,
      [`DEM-K6-${k}`, applicant.id, org.id, status]
    );
    return { requestId: request.id as number, reference: request.reference as string, organisationName: org.name as string };
  }

  async function phase(requestId: number, code: string) {
    return (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [requestId, code])).id as number;
  }

  async function meeting(phaseId: number, type: string, agentId: number, daysAgo: number, cr: string | null = null, status = 'held') {
    return (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, cr_document_url, cr_uploaded_at)
       VALUES ($1, $2, $3, now() - ($4 || ' days')::interval, $5, $6, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END)
       RETURNING id`,
      [phaseId, type, agentId, String(daysAgo), status, cr]
    )).id as number;
  }

  async function overview() {
    const filters = analytics.defaultAnalyticsFilters();
    filters.periodStart = new Date(Date.now() - 365 * DAY);
    filters.periodEnd = new Date(Date.now() + DAY);
    return analytics.getAnalyticsOverview(filters);
  }

  it('lists what needs follow-up, with where to act, and both indicators stay neutral', async () => {
    const dn = await user('Agent DN K6');
    const r3 = await user('Inspecteur R3 K6');
    const active = await dossier('in_progress');
    const m3 = await phase(active.requestId, 'M3');
    const m4 = await phase(active.requestId, 'M4');
    const m6 = await phase(active.requestId, 'M6');
    const noReport = await meeting(m3, 'preliminary', dn, 30);
    const withReport = await meeting(m4, 'formal', dn, 20, '/api/files/cr.pdf');
    const visitNoOpinion = await meeting(m6, 'site_visit', r3, 5);
    await meeting(m3, 'preliminary', dn, 40, null, 'rescheduled');

    const answered = await dossier('in_progress');
    const m6b = await phase(answered.requestId, 'M6');
    const visitAnswered = await meeting(m6b, 'site_visit', r3, 6);
    await pool.query(
      `INSERT INTO site_inspections (phase_id, meeting_id, r3_agent_id, verdict, note) VALUES ($1, $2, $3, 'compliant', 'RAS')`,
      [m6b, visitAnswered, r3]
    );

    const closed = await dossier('rejected');
    const cm3 = await phase(closed.requestId, 'M3');
    const cm6 = await phase(closed.requestId, 'M6');
    const closedNoReport = await meeting(cm3, 'preliminary', dn, 50);
    const closedVisit = await meeting(cm6, 'site_visit', r3, 45);

    const data = await overview();
    const ids = (list: { meetingId: number }[]) => list.map((item) => item.meetingId);
    const mine = new Set([noReport, withReport, visitNoOpinion, visitAnswered, closedNoReport, closedVisit]);
    const ours = (list: { meetingId: number }[]) => ids(list).filter((id) => mine.has(id));

    assert.deepEqual(ours(data.meetingFollowUps.missingReports), [noReport]);
    assert.deepEqual(ours(data.meetingFollowUps.missingR3Opinions), [visitNoOpinion]);

    const report = data.meetingFollowUps.missingReports.find((item) => item.meetingId === noReport)!;
    assert.deepEqual(
      { ...report, scheduledAt: typeof report.scheduledAt },
      {
        meetingId: noReport,
        requestId: active.requestId,
        reference: active.reference,
        organisationName: active.organisationName,
        meetingType: 'preliminary',
        phaseCode: 'M3',
        scheduledAt: 'string',
        agentName: 'Agent DN K6',
      }
    );
    const opinion = data.meetingFollowUps.missingR3Opinions.find((item) => item.meetingId === visitNoOpinion)!;
    assert.equal(opinion.phaseCode, 'M6');
    assert.equal(opinion.agentName, 'Inspecteur R3 K6');

    const point = (key: string) => data.blockingPoints.find((p) => p.key === key)!;
    assert.equal(point('missing_reports').tone, 'info');
    assert.equal(point('missing_r3_opinions').tone, 'info');
    assert.equal(point('missing_reports').value, String(data.meetingFollowUps.missingReports.length));
    assert.equal(point('missing_r3_opinions').value, String(data.meetingFollowUps.missingR3Opinions.length));
  });

  it('uploading the compte-rendu removes the meeting from the list; the opinion removes the visit', async () => {
    const dn = await user('Agent DN K6b');
    const active = await dossier('in_progress');
    const m3 = await phase(active.requestId, 'M3');
    const m6 = await phase(active.requestId, 'M6');
    const prelim = await meeting(m3, 'preliminary', dn, 10);
    const visit = await meeting(m6, 'site_visit', dn, 3);

    let data = await overview();
    assert.ok(data.meetingFollowUps.missingReports.some((item) => item.meetingId === prelim));
    assert.ok(data.meetingFollowUps.missingR3Opinions.some((item) => item.meetingId === visit));

    // Same columns attachMeetingReport writes.
    await pool.query(`UPDATE meetings SET cr_document_url = '/api/files/x', cr_uploaded_at = now() WHERE id = $1`, [prelim]);
    await pool.query(
      `INSERT INTO site_inspections (phase_id, meeting_id, r3_agent_id, verdict, note) VALUES ($1, $2, $3, 'non_compliant', 'x')`,
      [m6, visit, dn]
    );
    data = await overview();
    assert.ok(!data.meetingFollowUps.missingReports.some((item) => item.meetingId === prelim));
    assert.ok(!data.meetingFollowUps.missingR3Opinions.some((item) => item.meetingId === visit));
  });

  it('the Réunions cockpit counts the same meetings without a compte-rendu, neutral tone', async () => {
    const dn = await user('Agent DN K6c');
    const active = await dossier('in_progress');
    const closed = await dossier('cancelled');
    const pa = await phase(active.requestId, 'M4');
    const pv = await phase(active.requestId, 'M6');
    const pc = await phase(closed.requestId, 'M4');
    const counted = await meeting(pa, 'formal', dn, 2);
    const visit = await meeting(pv, 'site_visit', dn, 2);
    const onClosed = await meeting(pc, 'formal', dn, 2);

    const from = new Date(Date.now() - 3 * DAY).toISOString();
    const to = new Date(Date.now() + DAY).toISOString();
    const cockpit = await meetingsService.listMeetingCockpit({ from, to });
    const listed = new Set(cockpit.missingReports.map((item) => item.id));
    assert.ok(listed.has(counted), 'held formal meeting without CR');
    assert.ok(!listed.has(visit), 'site visit: no compte-rendu');
    assert.ok(!listed.has(onClosed), 'closed dossier');
    const metric = cockpit.metrics.find((m) => m.key === 'missing_reports')!;
    assert.equal(metric.tone, 'info');

    const analyticsIds = new Set((await overview()).meetingFollowUps.missingReports.map((item) => item.meetingId));
    for (const id of [counted, visit, onClosed]) {
      assert.equal(analyticsIds.has(id), listed.has(id), `meeting ${id}: analytics and Réunions agree`);
    }
  });
});
