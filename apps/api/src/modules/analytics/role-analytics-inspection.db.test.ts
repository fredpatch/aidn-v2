/** ROLE-ANALYTICS-1E - Cellule Inspection provider on real PostgreSQL
 *  (skipped without DATABASE_URL). History is seeded in March 2014 (previous
 *  period: the 31 days before); the current queue is read for fresh CI agents
 *  (exact) and, for the service, as a delta around the seeding. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import type { RoleAnalyticsOverview, RoleAnalyticsScope } from '@aidn/shared';
import { pgConnectionConfig } from '../../shared/db/connection.js';
import { resolveAnalyticsPeriod } from './period.js';
import type { RoleAnalyticsProvider } from './role-analytics.service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const NOW = new Date('2026-10-19T09:00:00Z');
const MARCH = ['2014-03-01', '2014-03-31'] as const;

describe('ROLE-ANALYTICS-1E inspection provider (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  let inspection: RoleAnalyticsProvider;
  const tag = Date.now().toString(36);
  let n = 0;
  const created = { users: [] as number[], organisations: [] as number[], applicants: [] as number[], requests: [] as number[] };
  let agentA: number;
  let agentB: number;
  let scheduler: number;
  const visit: Record<string, { requestId: number; reference: string; phaseId: number; meetingId: number }> = {};

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    const [providerModule, dbModule] = await Promise.all([
      import('./providers/inspection.provider.js'),
      import('../../shared/db/index.js'),
    ]);
    inspection = providerModule.inspectionAnalyticsProvider;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    const requests = created.requests;
    if (requests.length) {
      const phaseIds = `SELECT id FROM phases WHERE request_id = ANY($1)`;
      await pool.query(`DELETE FROM site_inspections WHERE phase_id IN (${phaseIds})`, [requests]);
      await pool.query(`DELETE FROM meetings WHERE phase_id IN (${phaseIds})`, [requests]);
      await pool.query(`DELETE FROM payments WHERE phase_id IN (${phaseIds})`, [requests]);
      await pool.query(`DELETE FROM phases WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [requests]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (created.users.length) {
      // Every seeded audit row names a test user.
      await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [created.users]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const at = (value: string | null | undefined) => value ?? null;

  async function user(label: string) {
    const k = `${tag}-${++n}`;
    const id = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, $2, $3) RETURNING id`, [`RI${k}`, label, `ri-${k}@test.local`])).id as number;
    created.users.push(id);
    return id;
  }

  interface VisitSeed {
    agent: number;
    scheduledAt: string;
    status: string;
    dossierStatus?: string;
    payment?: string | null;
    /** M6 closed by the verdict at this time. */
    verdict?: { value: string; at: string; by?: number };
    /** A superseded slot (status 'rescheduled') kept before the current row. */
    supersededAt?: string;
  }

  async function seedVisit(key: string, seed: VisitSeed) {
    const k = `${tag}-${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA RI ${k}`])).id as number;
    created.organisations.push(org);
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `ri-a-${k}@test.local`])).id as number;
    created.applicants.push(applicant);
    const reference = `DEM-RI-${k}`;
    const requestId = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [reference, applicant, org, seed.dossierStatus ?? 'in_progress']
    )).id as number;
    created.requests.push(requestId);
    const phaseId = (await one(
      `INSERT INTO phases (request_id, phase_code, status, opened_at, closed_at)
       VALUES ($1, 'M6', $2, '2013-01-01', ($3::timestamptz AT TIME ZONE 'UTC')) RETURNING id`,
      [requestId, seed.verdict ? 'closed' : 'open', at(seed.verdict?.at)]
    )).id as number;
    if (seed.payment !== null) await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, $2)`, [phaseId, seed.payment ?? 'validated']);
    const insertMeeting = (scheduledAt: string, status: string) =>
      one(
        `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status)
         VALUES ($1, 'site_visit', $2, ($3::timestamptz AT TIME ZONE 'UTC'), $4, 'not_required') RETURNING id`,
        [phaseId, seed.agent, scheduledAt, status]
      );
    if (seed.supersededAt) await insertMeeting(seed.supersededAt, 'rescheduled');
    const meetingId = (await insertMeeting(seed.scheduledAt, seed.status)).id as number;
    if (seed.verdict) {
      // submitted_at deliberately differs from the phase closure (the authoritative time).
      await pool.query(
        `INSERT INTO site_inspections (phase_id, meeting_id, r3_agent_id, verdict, note, submitted_at)
         VALUES ($1, $2, $3, $4, 'Avis', ($5::timestamptz AT TIME ZONE 'UTC') - interval '2 hours')`,
        [phaseId, meetingId, seed.verdict.by ?? seed.agent, seed.verdict.value, seed.verdict.at]
      );
    }
    visit[key] = { requestId, reference, phaseId, meetingId };
    return visit[key];
  }

  async function audit(key: string, action: string, userId: number, createdAt: string) {
    const v = visit[key];
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, module, entity_id, request_id, created_at)
       VALUES ($1, $2, 'M6', $3, $4, ($5::timestamptz AT TIME ZONE 'UTC'))`,
      [userId, action, v.meetingId, v.requestId, createdAt]
    );
  }

  const context = (scope: RoleAnalyticsScope, userId: number, roles: string[], from: string = MARCH[0], to: string = MARCH[1]) => ({
    domain: 'inspection' as const,
    scope,
    viewer: { userId, roles },
    now: NOW,
    period: resolveAnalyticsPeriod({ period: 'custom', from, to }, NOW),
  });
  const mineOf = (userId: number) => context('mine', userId, ['r3_agent']);
  const service = () => context('service', scheduler, ['SU']);
  const metric = (overview: RoleAnalyticsOverview, key: string) => overview.metrics.find((m) => m.key === key);
  const value = (overview: RoleAnalyticsOverview, key: string) => metric(overview, key)?.value;
  const warning = (overview: RoleAnalyticsOverview, key: string) => overview.warnings.find((w) => w.key === key);

  before(async () => {
    agentA = await user('Agent CI A');
    agentB = await user('Agent CI B');
    scheduler = await user('Agent DN planificateur');
    await seedVisit('V1', { agent: agentA, scheduledAt: '2014-03-03T09:00:00Z', status: 'held', verdict: { value: 'compliant', at: '2014-03-06T10:00:00Z' } });
    await audit('V1', 'MEETING_SCHEDULED', scheduler, '2014-02-20T10:00:00Z');
    await audit('V1', 'SITE_VISIT_HELD', agentA, '2014-03-05T10:00:00Z');
    await seedVisit('V2', { agent: agentB, scheduledAt: '2014-03-10T09:00:00Z', status: 'held', verdict: { value: 'non_compliant', at: '2014-03-12T10:00:00Z' } });
    await audit('V2', 'SITE_VISIT_HELD', agentB, '2014-03-10T10:00:00Z');
    // V3: a superseded slot on 03-15, the current visit on 03-25.
    await seedVisit('V3', { agent: agentA, scheduledAt: '2014-03-25T09:00:00Z', supersededAt: '2014-03-15T09:00:00Z', status: 'held', verdict: { value: 'compliant_with_reserves', at: '2014-03-28T10:00:00Z' } });
    await audit('V3', 'SITE_VISIT_HELD', agentA, '2014-03-25T10:00:00Z');
    // V4: planned and held in February, opinion in March.
    await seedVisit('V4', { agent: agentA, scheduledAt: '2014-02-10T09:00:00Z', status: 'held', verdict: { value: 'compliant', at: '2014-03-02T10:00:00Z' } });
    await audit('V4', 'SITE_VISIT_HELD', agentA, '2014-02-11T10:00:00Z');
    // V5 on a now-rejected dossier: history keeps it.
    await seedVisit('V5', { agent: agentA, dossierStatus: 'rejected', scheduledAt: '2014-03-08T09:00:00Z', status: 'held', verdict: { value: 'compliant', at: '2014-03-09T10:00:00Z' } });
    await audit('V5', 'SITE_VISIT_HELD', agentA, '2014-03-08T10:00:00Z');
    // V6: planned and given an opinion in February (previous period only).
    await seedVisit('V6', { agent: agentB, scheduledAt: '2014-02-15T09:00:00Z', status: 'held', verdict: { value: 'compliant', at: '2014-02-20T10:00:00Z' } });
    // V7: marked held by the DN through the old generic route (MEETING_HELD): not a CI held event.
    await seedVisit('V7', { agent: agentA, scheduledAt: '2014-03-18T09:00:00Z', status: 'held' });
    await audit('V7', 'MEETING_HELD', scheduler, '2014-03-20T10:00:00Z');
    await seedVisit('V8', { agent: agentB, scheduledAt: '2014-03-29T09:00:00Z', status: 'held' });
    await audit('V8', 'SITE_VISIT_HELD', agentB, '2014-03-29T10:00:00Z');
    await seedVisit('V9', { agent: agentB, scheduledAt: '2014-03-30T09:00:00Z', status: 'held' });
    await audit('V9', 'SITE_VISIT_HELD', agentB, '2014-03-30T10:00:00Z');
  });

  it('planned visits: scheduledAt in the period, superseded slots excluded, mine = assigned agent, previous period', async () => {
    const all = await inspection.getOverview(service());
    const planned = metric(all, 'inspection.visits_planned');
    assert.deepEqual(
      { value: planned?.value, previousValue: planned?.previousValue, basis: planned?.basis, reliability: planned?.reliability },
      { value: 7, previousValue: 2, basis: 'period', reliability: 'reliable' },
      'V1 V2 V3 V5 V7 V8 V9 (not the superseded 03-15 slot); previous: V4 V6'
    );
    const mineA = await inspection.getOverview(mineOf(agentA));
    assert.equal(value(mineA, 'inspection.visits_planned'), 4, 'V1 V3 V5 V7');
    assert.equal(metric(mineA, 'inspection.visits_planned')?.previousValue, 1, 'V4');
    assert.equal(value(await inspection.getOverview(mineOf(agentB)), 'inspection.visits_planned'), 3);
  });

  it('visits recorded held: SITE_VISIT_HELD only (never the generic MEETING_HELD), audit actor, recorded-time caveat', async () => {
    const all = await inspection.getOverview(service());
    const held = metric(all, 'inspection.visit_held_recorded');
    assert.deepEqual(
      { value: held?.value, previousValue: held?.previousValue, reliability: held?.reliability, caveatKey: held?.caveatKey },
      { value: 6, previousValue: 1, reliability: 'caveat', caveatKey: 'recorded_time_not_actual_visit_time' },
      'V1 V2 V3 V5 V8 V9; not V7'
    );
    assert.equal(value(await inspection.getOverview(mineOf(agentA)), 'inspection.visit_held_recorded'), 3);
    assert.equal(value(await inspection.getOverview(mineOf(agentB)), 'inspection.visit_held_recorded'), 3);
  });

  it('opinions: timed by the M6 closure, attributed to site_inspections.r3AgentId, with the previous period', async () => {
    const all = await inspection.getOverview(service());
    const opinions = metric(all, 'inspection.opinion_submitted');
    assert.deepEqual(
      { value: opinions?.value, previousValue: opinions?.previousValue, reliability: opinions?.reliability },
      { value: 5, previousValue: 1, reliability: 'reliable' },
      'V1 V2 V3 V4 V5 (V5 dossier now rejected); previous: V6'
    );
    const mineA = await inspection.getOverview(mineOf(agentA));
    assert.equal(value(mineA, 'inspection.opinion_submitted'), 4);
    assert.equal(value(await inspection.getOverview(mineOf(agentB)), 'inspection.opinion_submitted'), 1);
  });

  it('verdict distribution: the stored enum values, mine and service', async () => {
    const all = await inspection.getOverview(service());
    assert.deepEqual(
      [value(all, 'inspection.verdict_compliant'), value(all, 'inspection.verdict_compliant_with_reserves'), value(all, 'inspection.verdict_non_compliant')],
      [3, 1, 1]
    );
    const mineA = await inspection.getOverview(mineOf(agentA));
    assert.deepEqual(
      [value(mineA, 'inspection.verdict_compliant'), value(mineA, 'inspection.verdict_compliant_with_reserves'), value(mineA, 'inspection.verdict_non_compliant')],
      [3, 1, 0]
    );
  });

  it('recent activity: CI events only, newest first, capped at 10; DN scheduling and the generic held are not CI activity', async () => {
    const all = await inspection.getOverview(service());
    assert.equal(all.recentActivity.length, 10, '11 CI events in March, capped');
    for (let i = 1; i < all.recentActivity.length; i += 1) assert.ok(all.recentActivity[i - 1].at >= all.recentActivity[i].at);
    assert.deepEqual(all.recentActivity[0], {
      at: '2014-03-30T10:00:00.000Z',
      eventKey: 'inspection.visit_held',
      actor: { kind: 'staff', userId: agentB, fullName: 'Agent CI B' },
      requestId: visit.V9.requestId,
      requestReference: visit.V9.reference,
      href: `/mes-inspections?tab=all&id=site_visit:${visit.V9.meetingId}`,
    });
    const v3Verdict = all.recentActivity.find((a) => a.requestId === visit.V3.requestId && a.eventKey === 'inspection.verdict_submitted');
    assert.equal(v3Verdict?.at, '2014-03-28T10:00:00.000Z', 'the M6 closure, not submitted_at');
    assert.ok(!all.recentActivity.some((a) => a.actor?.kind === 'staff' && a.actor.userId === scheduler));

    const mineA = await inspection.getOverview(mineOf(agentA));
    assert.deepEqual(
      mineA.recentActivity.map((a) => [a.eventKey, a.requestId]),
      [
        ['inspection.verdict_submitted', visit.V3.requestId],
        ['inspection.visit_held', visit.V3.requestId],
        ['inspection.verdict_submitted', visit.V5.requestId],
        ['inspection.visit_held', visit.V5.requestId],
        ['inspection.verdict_submitted', visit.V1.requestId],
        ['inspection.visit_held', visit.V1.requestId],
        ['inspection.verdict_submitted', visit.V4.requestId],
      ]
    );
    const mineScheduler = await inspection.getOverview(context('mine', scheduler, ['SU']));
    assert.deepEqual(mineScheduler.recentActivity, [], 'scheduling a visit is DN work, not CI activity');
  });

  it('an empty period: zero counts, no activity', async () => {
    const overview = await inspection.getOverview(context('service', scheduler, ['SU'], '2013-06-01', '2013-06-30'));
    for (const key of ['inspection.visits_planned', 'inspection.visit_held_recorded', 'inspection.opinion_submitted', 'inspection.verdict_compliant']) {
      assert.equal(value(overview, key), 0, key);
    }
    assert.deepEqual(overview.recentActivity, []);
    assert.ok(!overview.metrics.some((m) => m.key.includes('delay')), 'no visit -> opinion delay without an actual held time');
  });

  it('current state from the CI queue: overdue, blocked by payment (not late), awaiting opinion; closed dossiers excluded', async () => {
    const before = await inspection.getOverview(service());
    const agentC = await user('Agent CI C');
    const agentD = await user('Agent CI D');
    const q1 = await seedVisit('Q1', { agent: agentC, scheduledAt: '1999-06-01T09:00:00Z', status: 'scheduled' });
    const q2 = await seedVisit('Q2', { agent: agentC, scheduledAt: '1999-05-01T09:00:00Z', status: 'scheduled', payment: 'pending_validation' });
    await seedVisit('Q3', { agent: agentC, scheduledAt: '2000-01-01T09:00:00Z', status: 'held' });
    await seedVisit('Q4', { agent: agentC, dossierStatus: 'cancelled', scheduledAt: '1998-06-01T09:00:00Z', status: 'scheduled' });
    await seedVisit('Q5', { agent: agentD, scheduledAt: '1998-01-01T09:00:00Z', status: 'scheduled' });
    const after = await inspection.getOverview(service());

    const mineC = await inspection.getOverview(mineOf(agentC));
    assert.deepEqual(
      ['inspection.visit_overdue', 'inspection.blocked_by_payment', 'inspection.awaiting_opinion'].map((key) => [key, value(mineC, key), metric(mineC, key)?.basis]),
      [
        ['inspection.visit_overdue', 1, 'current'],
        ['inspection.blocked_by_payment', 1, 'current'],
        ['inspection.awaiting_opinion', 1, 'current'],
      ],
      'Q1 overdue; Q2 blocked by payment (not counted late); Q3 awaiting the opinion; Q4 closed dossier excluded'
    );
    const overdue = warning(mineC, 'inspection.visit_overdue');
    assert.equal(overdue?.severity, 'danger');
    assert.equal(overdue?.oldest?.requestId, q1.requestId, 'not the closed Q4, not agent D\'s Q5');
    assert.equal(overdue?.href, `/mes-inspections?tab=to_hold&id=site_visit:${q1.meetingId}`);
    const blocked = warning(mineC, 'inspection.blocked_by_payment');
    assert.equal(blocked?.severity, 'info', 'blocked by Finance / the applicant, not an agent delay');
    assert.equal(blocked?.oldest?.requestId, q2.requestId);
    assert.equal(blocked?.href, `/mes-inspections?tab=awaiting_payment&id=site_visit:${q2.meetingId}`);
    const awaiting = warning(mineC, 'inspection.awaiting_opinion');
    assert.equal(awaiting?.severity, 'info');
    assert.equal(awaiting?.oldest, undefined, 'no held time exists: no "since" is shown');
    assert.equal(awaiting?.href, '/mes-inspections?tab=verdict_due');

    const delta = (key: string) => (value(after, key) ?? 0) - (value(before, key) ?? 0);
    assert.deepEqual(
      [delta('inspection.visit_overdue'), delta('inspection.blocked_by_payment'), delta('inspection.awaiting_opinion')],
      [2, 1, 1],
      'service (SU): agents C and D'
    );
  });
});
