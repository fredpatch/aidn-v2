/** SESSION1-MEET-1 - meeting confirmation / counter-proposal against a real
 *  PostgreSQL (skipped without DATABASE_URL; needs a migrated, disposable
 *  database). Seeds its own dossiers and only reads them back. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const DAY = 86_400_000;

describe('SESSION1-MEET-1 meeting negotiation (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let meetings: typeof import('./meetings.service.js');
  let negotiation: typeof import('./meeting-negotiation.service.js');
  let site: typeof import('../site-inspection/site-inspection.service.js');
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;
  // Distinct future slots, so tests never collide on the (agent, slot) index.
  let slotSeq = 0;
  const slot = (days = 10) => new Date(Date.now() + days * DAY + ++slotSeq * 60_000);

  before(async () => {
    // timestamp columns hold UTC (drizzle convention): read them back as UTC,
    // not in the machine's zone (DST would shift them by an hour).
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      types: {
        getTypeParser: ((oid: number, format?: string) =>
          oid === 1114
            ? (value: string) => new Date(`${value.replace(' ', 'T')}Z`)
            : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
      },
    });
    meetings = await import('./meetings.service.js');
    negotiation = await import('./meeting-negotiation.service.js');
    site = await import('../site-inspection/site-inspection.service.js');
    const dbModule = await import('../../shared/db/index.js');
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const all = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

  async function user() {
    const code = `MT${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [
      code,
      `${code}@test.local`,
    ])).id as number;
  }

  /** An open dossier with open M3, M4 and M6 phases and the M4 letter back. */
  async function dossier(status = 'pending_review') {
    const k = `${tag}-${++n}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA MEET ${k}`]
    )).id;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`,
      [org, `p-${k}@test.local`]
    )).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-MEET-${k}`, applicant, org, status]
    )).id as number;
    const phase: Record<string, number> = {};
    for (const code of ['M3', 'M4', 'M6']) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [request, code])).id;
    }
    await pool.query(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('formal_request_letter', $1, 'pending_review')`,
      [request]
    );
    return { applicant, request, phase };
  }

  async function propose(phaseId: number, agent: number, at = slot(), meetingType: 'preliminary' | 'formal' = 'preliminary') {
    const { meeting } = await meetings.scheduleMeeting({
      phaseId,
      meetingType,
      dnAgentId: agent,
      actorUserId: agent,
      scheduledAt: at.toISOString(),
    });
    return meeting.id;
  }

  const row = (id: number) => one(`SELECT * FROM meetings WHERE id = $1`, [id]);
  const events = (id: number) =>
    all(`SELECT * FROM meeting_negotiation_events WHERE meeting_id = $1 ORDER BY created_at, id`, [id]);
  const audits = (id: number, action: string) =>
    all(`SELECT * FROM audit_logs WHERE entity_id = $1 AND action = $2 ORDER BY id`, [id, action]);

  describe('creation, status and reschedule (transactional core)', () => {
    it('a DN proposal for M3 awaits the applicant, with a dn_proposed event and the real actor in the audit', async () => {
      const d = await dossier();
      const agent = await user();
      const actor = await user();
      const at = slot();
      const { meeting } = await meetings.scheduleMeeting({
        phaseId: d.phase.M3,
        meetingType: 'preliminary',
        dnAgentId: agent,
        actorUserId: actor,
        scheduledAt: at.toISOString(),
      });
      const saved = await row(meeting.id);
      assert.equal(saved.confirmation_status, 'awaiting_applicant');
      assert.equal(saved.confirmed_at, null);
      const [event] = await events(meeting.id);
      assert.equal(event.kind, 'dn_proposed');
      assert.equal(event.actor_user_id, actor);
      assert.equal(new Date(event.slot_at).getTime(), new Date(saved.scheduled_at).getTime());
      const [audit] = await audits(meeting.id, 'MEETING_SCHEDULED');
      assert.equal(audit.user_id, actor, 'audit actor is the acting user, not the assigned agent');
      assert.equal(audit.details.dnAgentId, agent);
      assert.equal(audit.module, 'M3');
      assert.equal(audit.request_id, d.request);
    });

    it('a formal proposal is audited under M4', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await propose(d.phase.M4, agent, slot(), 'formal');
      assert.equal((await row(id)).confirmation_status, 'awaiting_applicant');
      assert.equal((await audits(id, 'MEETING_SCHEDULED'))[0].module, 'M4');
    });

    it('a site visit is not_required, has no negotiation event, and is audited under M6', async () => {
      const d = await dossier();
      const r3 = await user();
      const actor = await user();
      const { meeting } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: r3,
        scheduledAt: slot().toISOString(),
        actorUserId: actor,
      });
      const saved = await row(meeting.id);
      assert.equal(saved.confirmation_status, 'not_required');
      assert.equal((await events(meeting.id)).length, 0);
      const [audit] = await audits(meeting.id, 'MEETING_SCHEDULED');
      assert.equal(audit.user_id, actor);
      assert.equal(audit.module, 'M6');
    });

    it('held / no_show / file_cancelled are refused until the applicant confirmed', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await propose(d.phase.M3, agent);
      for (const status of ['held', 'no_show', 'file_cancelled'] as const) {
        await assert.rejects(meetings.markMeetingStatus(id, agent, status), /MEETING_NOT_CONFIRMED/);
      }
      assert.equal((await row(id)).status, 'scheduled');
      assert.equal((await one(`SELECT status FROM requests WHERE id = $1`, [d.request])).status, 'pending_review');
    });

    it('the R3 queue still lists a visit scheduled for the agent by someone else (actor fix kept M6 unchanged)', async () => {
      const d = await dossier();
      const r3 = await user();
      const dn = await user();
      const { meeting } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: r3,
        scheduledAt: slot().toISOString(),
        actorUserId: dn,
      });
      const audit = await one(
        `SELECT user_id, details->>'dnAgentId' AS agent FROM audit_logs WHERE action = 'MEETING_SCHEDULED' AND entity_id = $1 ORDER BY id DESC LIMIT 1`,
        [meeting.id]
      );
      assert.equal(audit.user_id, dn);
      assert.equal(Number(audit.agent), r3);
      const queue = await site.getMyQueue({ userId: r3, roles: ['r3_agent'] });
      assert.ok(queue.items.some((item: { siteVisit: { id: number } }) => item.siteVisit.id === meeting.id));
    });

    it('a site visit can still be marked held (not_required counts as confirmed), audited under M6', async () => {
      const d = await dossier();
      const r3 = await user();
      const { meeting } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: r3,
        scheduledAt: slot().toISOString(),
        actorUserId: r3,
      });
      await meetings.markMeetingStatus(meeting.id, r3, 'held');
      assert.equal((await row(meeting.id)).status, 'held');
      assert.equal((await audits(meeting.id, 'MEETING_HELD'))[0].module, 'M6');
    });

    it('a confirmed formal meeting can be marked no_show, audited under M4 (no hard-coded M3)', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await propose(d.phase.M4, agent, slot(), 'formal');
      await negotiation.confirmOnBehalf(id, agent, 'Confirmé par téléphone');
      await meetings.markMeetingStatus(id, agent, 'no_show');
      assert.equal((await row(id)).status, 'no_show');
      assert.equal((await audits(id, 'MEETING_NO_SHOW'))[0].module, 'M4');
    });

    it('DN reschedule of a confirmed M3 meeting creates a NEW proposal the applicant must confirm again', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await propose(d.phase.M3, agent);
      await negotiation.confirmMeeting(id, d.applicant);
      const newAt = slot();
      const { meeting } = await meetings.rescheduleMeeting(id, agent, newAt.toISOString(), 'Agent indisponible');
      const old = await row(id);
      const replacement = await row(meeting.id);
      assert.equal(old.status, 'rescheduled');
      assert.equal(old.confirmation_status, 'confirmed', 'superseded row is frozen as it was');
      assert.equal(replacement.status, 'scheduled');
      assert.equal(replacement.confirmation_status, 'awaiting_applicant');
      assert.equal(replacement.confirmed_at, null);
      const oldEvents = await events(id);
      const rescheduled = oldEvents.at(-1);
      assert.equal(rescheduled.kind, 'dn_rescheduled');
      assert.equal(rescheduled.resulting_meeting_id, meeting.id);
      assert.equal(rescheduled.remark, 'Agent indisponible');
      assert.deepEqual((await events(meeting.id)).map((e) => e.kind), ['dn_proposed']);
      assert.equal((await audits(id, 'MEETING_RESCHEDULED'))[0].module, 'M3');
    });

    it('a failed M6 reschedule (slot taken) keeps the original visit active and creates nothing', async () => {
      const d = await dossier();
      const other = await dossier();
      const r3 = await user();
      const visitAt = slot();
      const takenAt = slot();
      const { meeting: visit } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: r3,
        scheduledAt: visitAt.toISOString(),
        actorUserId: r3,
      });
      await site.scheduleSiteVisit({
        phaseId: other.phase.M6,
        r3AgentId: r3,
        scheduledAt: takenAt.toISOString(),
        actorUserId: r3,
      });
      const before = (await one(`SELECT count(*)::int AS c FROM meetings WHERE phase_id = $1`, [d.phase.M6])).c;
      await assert.rejects(meetings.rescheduleMeeting(visit.id, r3, takenAt.toISOString()), /MEETING_SLOT_CONFLICT/);
      const original = await row(visit.id);
      assert.equal(original.status, 'scheduled', 'the original visit keeps its slot');
      assert.equal(original.confirmation_status, 'not_required');
      assert.equal((await one(`SELECT count(*)::int AS c FROM meetings WHERE phase_id = $1`, [d.phase.M6])).c, before);
      assert.equal((await audits(visit.id, 'MEETING_RESCHEDULED')).length, 0);
    });

    it('a successful M6 reschedule keeps the not_required behaviour', async () => {
      const d = await dossier();
      const r3 = await user();
      const { meeting: visit } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: r3,
        scheduledAt: slot().toISOString(),
        actorUserId: r3,
      });
      const { meeting } = await meetings.rescheduleMeeting(visit.id, r3, slot().toISOString());
      assert.equal((await row(visit.id)).status, 'rescheduled');
      assert.equal((await row(meeting.id)).confirmation_status, 'not_required');
      assert.equal((await events(meeting.id)).length, 0);
      assert.equal((await audits(visit.id, 'MEETING_RESCHEDULED'))[0].module, 'M6');
    });

    it('rescheduling to the same slot is refused', async () => {
      const d = await dossier();
      const agent = await user();
      const at = slot();
      const id = await propose(d.phase.M3, agent, at);
      await assert.rejects(meetings.rescheduleMeeting(id, agent, at.toISOString()), /RESCHEDULE_SAME_SLOT/);
    });
  });

  describe('applicant commands', () => {
    it('confirms an own M3 meeting: confirmed_at set, event + audit carry the applicant', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await propose(d.phase.M3, agent);
      await negotiation.confirmMeeting(id, d.applicant);
      const saved = await row(id);
      assert.equal(saved.confirmation_status, 'confirmed');
      assert.ok(saved.confirmed_at);
      const last = (await events(id)).at(-1);
      assert.equal(last.kind, 'applicant_confirmed');
      assert.equal(last.actor_applicant_id, d.applicant);
      assert.equal(last.actor_user_id, null);
      const [audit] = await audits(id, 'MEETING_CONFIRMED_BY_APPLICANT');
      assert.equal(audit.applicant_id, d.applicant);
      assert.equal(audit.user_id, null);
      assert.equal(audit.module, 'M3');
      assert.equal(audit.request_id, d.request);
    });

    it('confirms an own M4 meeting (audited under M4)', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await propose(d.phase.M4, agent, slot(), 'formal');
      await negotiation.confirmMeeting(id, d.applicant);
      assert.equal((await row(id)).confirmation_status, 'confirmed');
      assert.equal((await audits(id, 'MEETING_CONFIRMED_BY_APPLICANT'))[0].module, 'M4');
    });

    it('a second confirmation is idempotent: no duplicate event, no duplicate audit', async () => {
      const d = await dossier();
      const id = await propose(d.phase.M3, await user());
      await negotiation.confirmMeeting(id, d.applicant);
      const first = await row(id);
      await negotiation.confirmMeeting(id, d.applicant);
      const second = await row(id);
      assert.equal(new Date(second.confirmed_at).getTime(), new Date(first.confirmed_at).getTime());
      assert.equal((await events(id)).filter((e) => e.kind === 'applicant_confirmed').length, 1);
      assert.equal((await audits(id, 'MEETING_CONFIRMED_BY_APPLICANT')).length, 1);
    });

    it('proposes an alternate: original slot kept and still reserved, alternate stored', async () => {
      const d = await dossier();
      const agent = await user();
      const at = slot();
      const id = await propose(d.phase.M3, agent, at);
      const alternate = slot();
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: alternate.toISOString(), remark: '  Indisponible ce jour  ' });
      const saved = await row(id);
      assert.equal(saved.status, 'scheduled');
      assert.equal(saved.confirmation_status, 'awaiting_dn');
      assert.equal(new Date(saved.scheduled_at).getTime(), at.getTime(), 'original scheduledAt untouched');
      assert.equal(new Date(saved.alternate_scheduled_at).getTime(), alternate.getTime());
      assert.equal(saved.alternate_remark, 'Indisponible ce jour');
      // The original slot still blocks the agent.
      const other = await dossier();
      await assert.rejects(propose(other.phase.M3, agent, at), /MEETING_SLOT_CONFLICT/);
      assert.equal((await audits(id, 'MEETING_ALTERNATE_PROPOSED'))[0].applicant_id, d.applicant);
    });

    it('refuses a blank remark, a past date, an invalid date and the current slot', async () => {
      const d = await dossier();
      const at = slot();
      const id = await propose(d.phase.M3, await user(), at);
      const future = slot().toISOString();
      await assert.rejects(negotiation.proposeAlternate(id, d.applicant, { scheduledAt: future, remark: '   ' }), /ALTERNATE_REMARK_REQUIRED/);
      await assert.rejects(
        negotiation.proposeAlternate(id, d.applicant, { scheduledAt: new Date(Date.now() - DAY).toISOString(), remark: 'r' }),
        /ALTERNATE_IN_PAST/
      );
      await assert.rejects(negotiation.proposeAlternate(id, d.applicant, { scheduledAt: 'demain', remark: 'r' }), /MEETING_INVALID_DATE/);
      await assert.rejects(
        negotiation.proposeAlternate(id, d.applicant, { scheduledAt: at.toISOString(), remark: 'r' }),
        /ALTERNATE_SAME_AS_CURRENT/
      );
      assert.equal((await row(id)).confirmation_status, 'awaiting_applicant');
    });

    it("another applicant's meeting is MEETING_NOT_FOUND for both commands, and nothing changes", async () => {
      const d = await dossier();
      const intruder = await dossier();
      const id = await propose(d.phase.M3, await user());
      await assert.rejects(negotiation.confirmMeeting(id, intruder.applicant), /MEETING_NOT_FOUND/);
      await assert.rejects(
        negotiation.proposeAlternate(id, intruder.applicant, { scheduledAt: slot().toISOString(), remark: 'r' }),
        /MEETING_NOT_FOUND/
      );
      assert.equal((await row(id)).confirmation_status, 'awaiting_applicant');
      assert.equal((await events(id)).length, 1);
    });

    it('a closed dossier refuses applicant responses (DOSSIER_CLOSED)', async () => {
      const d = await dossier();
      const id = await propose(d.phase.M3, await user());
      await pool.query(`UPDATE requests SET status = 'rejected', rejection_reason = 'test' WHERE id = $1`, [d.request]);
      await assert.rejects(negotiation.confirmMeeting(id, d.applicant), /DOSSIER_CLOSED/);
      await assert.rejects(
        negotiation.proposeAlternate(id, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r' }),
        /DOSSIER_CLOSED/
      );
    });

    it('cannot respond while the DN decides, nor counter-propose a confirmed meeting', async () => {
      const d = await dossier();
      const id = await propose(d.phase.M3, await user());
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r' });
      await assert.rejects(negotiation.confirmMeeting(id, d.applicant), /MEETING_NOT_AWAITING_CONFIRMATION/);
      await assert.rejects(
        negotiation.proposeAlternate(id, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r2' }),
        /MEETING_NOT_AWAITING_CONFIRMATION/
      );
      const confirmed = await propose(d.phase.M4, await user(), slot(), 'formal');
      await negotiation.confirmMeeting(confirmed, d.applicant);
      await assert.rejects(
        negotiation.proposeAlternate(confirmed, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r' }),
        /MEETING_NOT_AWAITING_CONFIRMATION/
      );
    });

    it('a stale confirmation after a DN reschedule is refused, not applied to the superseded row', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await propose(d.phase.M3, agent);
      await meetings.rescheduleMeeting(id, agent, slot().toISOString());
      await assert.rejects(negotiation.confirmMeeting(id, d.applicant), /MEETING_NOT_SCHEDULED/);
      assert.equal((await row(id)).confirmation_status, 'awaiting_applicant');
    });
  });

  describe('DN commands and history', () => {
    it('accepts the alternate: confirmed replacement first, old row rescheduled, event links both', async () => {
      const d = await dossier();
      const agent = await user();
      const dn = await user();
      const id = await propose(d.phase.M3, agent);
      const alternate = slot();
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: alternate.toISOString(), remark: 'Plutôt le matin' });
      const { meeting } = await negotiation.acceptAlternate(id, dn);
      const old = await row(id);
      const replacement = await row(meeting.id);
      assert.equal(old.status, 'rescheduled');
      assert.equal(replacement.status, 'scheduled');
      assert.equal(replacement.confirmation_status, 'confirmed');
      assert.ok(replacement.confirmed_at);
      assert.equal(new Date(replacement.scheduled_at).getTime(), alternate.getTime());
      assert.equal(replacement.phase_id, old.phase_id);
      assert.equal(replacement.meeting_type, old.meeting_type);
      assert.equal(replacement.dn_agent_id, agent, 'same assigned agent, not the accepting DN');
      assert.equal(replacement.location, old.location);
      const accepted = (await events(id)).at(-1);
      assert.equal(accepted.kind, 'dn_alternate_accepted');
      assert.equal(accepted.actor_user_id, dn);
      assert.equal(accepted.resulting_meeting_id, meeting.id);
      assert.equal(new Date(accepted.slot_at).getTime(), alternate.getTime());
      assert.equal((await audits(id, 'MEETING_ALTERNATE_ACCEPTED'))[0].user_id, dn);
      // Accept twice -> stale.
      await assert.rejects(negotiation.acceptAlternate(id, dn), /MEETING_NOT_SCHEDULED/);
    });

    it('accept on a taken slot rolls back completely', async () => {
      const d = await dossier();
      const other = await dossier();
      const agent = await user();
      const at = slot();
      const taken = slot();
      const id = await propose(d.phase.M3, agent, at);
      await propose(other.phase.M3, agent, taken);
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: taken.toISOString(), remark: 'r' });
      const meetingCount = (await one(`SELECT count(*)::int AS c FROM meetings WHERE phase_id = $1`, [d.phase.M3])).c;
      const eventCount = (await events(id)).length;
      await assert.rejects(negotiation.acceptAlternate(id, agent), /MEETING_SLOT_CONFLICT/);
      const saved = await row(id);
      assert.equal(saved.status, 'scheduled');
      assert.equal(saved.confirmation_status, 'awaiting_dn');
      assert.equal(new Date(saved.alternate_scheduled_at).getTime(), taken.getTime());
      assert.equal((await one(`SELECT count(*)::int AS c FROM meetings WHERE phase_id = $1`, [d.phase.M3])).c, meetingCount);
      assert.equal((await events(id)).length, eventCount);
      assert.equal((await audits(id, 'MEETING_ALTERNATE_ACCEPTED')).length, 0);
      // The original slot is still reserved.
      await assert.rejects(propose(other.phase.M4, agent, at, 'formal'), /MEETING_SLOT_CONFLICT/);
    });

    it('two applicants propose the same slot: the first accepted wins', async () => {
      const a = await dossier();
      const b = await dossier();
      const agent = await user();
      const wanted = slot();
      const first = await propose(a.phase.M3, agent);
      const second = await propose(b.phase.M3, agent);
      await negotiation.proposeAlternate(first, a.applicant, { scheduledAt: wanted.toISOString(), remark: 'r' });
      await negotiation.proposeAlternate(second, b.applicant, { scheduledAt: wanted.toISOString(), remark: 'r' });
      await negotiation.acceptAlternate(first, agent);
      await assert.rejects(negotiation.acceptAlternate(second, agent), /MEETING_SLOT_CONFLICT/);
      assert.equal((await row(second)).confirmation_status, 'awaiting_dn');
    });

    it('refusal needs a reason, keeps the original slot, and supports another round', async () => {
      const d = await dossier();
      const dn = await user();
      const at = slot();
      const id = await propose(d.phase.M3, dn, at);
      const firstAlt = slot();
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: firstAlt.toISOString(), remark: 'r1' });
      await assert.rejects(negotiation.refuseAlternate(id, dn, '  '), /REFUSAL_REASON_REQUIRED/);
      await negotiation.refuseAlternate(id, dn, 'Agenda complet ce jour-là');
      let saved = await row(id);
      assert.equal(saved.confirmation_status, 'awaiting_applicant');
      assert.equal(saved.alternate_scheduled_at, null);
      assert.equal(saved.alternate_remark, null);
      assert.equal(new Date(saved.scheduled_at).getTime(), at.getTime());
      await assert.rejects(negotiation.refuseAlternate(id, dn, 'again'), /NO_PENDING_ALTERNATE/);
      // Round 2: new proposal, refused again; then the applicant confirms the original.
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r2' });
      await negotiation.refuseAlternate(id, dn, 'Toujours complet');
      await negotiation.confirmMeeting(id, d.applicant);
      saved = await row(id);
      assert.equal(saved.confirmation_status, 'confirmed');
      const history = await events(id);
      assert.deepEqual(
        history.map((e) => e.kind),
        [
          'dn_proposed',
          'applicant_alternate_proposed',
          'dn_alternate_refused',
          'applicant_alternate_proposed',
          'dn_alternate_refused',
          'applicant_confirmed',
        ]
      );
      const refusal = history[2];
      assert.equal(refusal.reason, 'Agenda complet ce jour-là');
      assert.equal(new Date(refusal.slot_at).getTime(), firstAlt.getTime(), 'the refused slot stays in history');
    });

    it('confirm on behalf needs a note and only applies while awaiting the applicant', async () => {
      const d = await dossier();
      const dn = await user();
      const id = await propose(d.phase.M3, dn);
      await assert.rejects(negotiation.confirmOnBehalf(id, dn, ''), /CONFIRMATION_NOTE_REQUIRED/);
      await negotiation.confirmOnBehalf(id, dn, 'Confirmé par téléphone le 14/10');
      const saved = await row(id);
      assert.equal(saved.confirmation_status, 'confirmed');
      const last = (await events(id)).at(-1);
      assert.equal(last.kind, 'dn_confirmed_on_behalf');
      assert.equal(last.remark, 'Confirmé par téléphone le 14/10');
      assert.equal((await audits(id, 'MEETING_CONFIRMED_BY_DN'))[0].user_id, dn);
      await assert.rejects(negotiation.confirmOnBehalf(id, dn, 'x'), /MEETING_NOT_AWAITING_CONFIRMATION/);
    });

    it('DN commands are refused on a closed dossier and on a site visit', async () => {
      const d = await dossier();
      const dn = await user();
      const id = await propose(d.phase.M3, dn);
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r' });
      const { meeting: visit } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: dn,
        scheduledAt: slot().toISOString(),
        actorUserId: dn,
      });
      await assert.rejects(negotiation.confirmOnBehalf(visit.id, dn, 'note'), /MEETING_NOT_AWAITING_CONFIRMATION/);
      await assert.rejects(negotiation.acceptAlternate(visit.id, dn), /NO_PENDING_ALTERNATE/);
      await pool.query(`UPDATE requests SET status = 'cancelled' WHERE id = $1`, [d.request]);
      await assert.rejects(negotiation.acceptAlternate(id, dn), /DOSSIER_CLOSED/);
      await assert.rejects(negotiation.refuseAlternate(id, dn, 'motif'), /DOSSIER_CLOSED/);
    });

    it('DN reschedule while a counter-proposal is pending supersedes it, history kept', async () => {
      const d = await dossier();
      const dn = await user();
      const id = await propose(d.phase.M3, dn);
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r' });
      const { meeting } = await meetings.rescheduleMeeting(id, dn, slot().toISOString());
      const old = await row(id);
      assert.equal(old.status, 'rescheduled');
      assert.equal(old.confirmation_status, 'awaiting_dn', 'frozen as it was');
      assert.equal((await row(meeting.id)).confirmation_status, 'awaiting_applicant');
      assert.deepEqual((await events(id)).map((e) => e.kind), ['dn_proposed', 'applicant_alternate_proposed', 'dn_rescheduled']);
    });

    it('the applicant sees the refusal reason (from history) but never DN notes or staff ids', async () => {
      const d = await dossier();
      const dn = await user();
      const id = await propose(d.phase.M3, dn);
      const refusedSlot = slot();
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: refusedSlot.toISOString(), remark: 'r' });
      await negotiation.refuseAlternate(id, dn, 'Agenda complet');
      const otherId = await propose(d.phase.M4, dn, slot(), 'formal');
      await negotiation.confirmOnBehalf(otherId, dn, 'NOTE-INTERNE téléphone');

      const mine = await meetings.listApplicantMeetings(d.applicant);
      const item = mine.find((m) => m.id === id)!;
      assert.equal(item.confirmationStatus, 'awaiting_applicant');
      assert.deepEqual(item.actions, ['confirm', 'propose_alternate']);
      assert.equal(item.ticketAvailable, false);
      assert.equal(item.lastRefusal?.reason, 'Agenda complet');
      assert.equal(item.lastRefusal?.proposedSlotAt, refusedSlot.toISOString());
      const other = mine.find((m) => m.id === otherId)!;
      assert.equal(other.confirmationStatus, 'confirmed');
      assert.equal(other.ticketAvailable, true);
      const payload = JSON.stringify(mine);
      assert.doesNotMatch(payload, /NOTE-INTERNE|dnAgentId|actorUserId|history/);

      const detail = await meetings.getMeeting(id, { applicant: { applicantId: d.applicant } });
      assert.equal((detail as { lastRefusal: { reason: string } | null }).lastRefusal?.reason, 'Agenda complet');
      assert.doesNotMatch(JSON.stringify(detail), /dnAgentId|negotiation/);
    });

    it('staff detail carries the negotiation view with the phase history and the taken-slot hint', async () => {
      const d = await dossier();
      const other = await dossier();
      const dn = await user();
      const taken = slot();
      await propose(other.phase.M3, dn, taken);
      const id = await propose(d.phase.M3, dn);
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: taken.toISOString(), remark: 'Le matin' });
      const detail = (await meetings.getMeeting(id, { user: { roles: ['dn_agent'] } })) as import('./meetings.types.js').StaffMeetingView;
      assert.equal(detail.negotiation.confirmationStatus, 'awaiting_dn');
      assert.deepEqual(detail.negotiation.alternate, { scheduledAt: taken.toISOString(), remark: 'Le matin' });
      assert.equal(detail.negotiation.alternateSlotTaken, true);
      assert.deepEqual(detail.negotiation.availableNegotiationActions, ['accept_alternate', 'refuse_alternate']);
      assert.ok(detail.negotiation.waitingSince);
      assert.equal(detail.negotiation.waitingDays, 0);
      assert.deepEqual(
        detail.negotiation.history?.map((e) => [e.kind, e.actor.type]),
        [
          ['dn_proposed', 'dn'],
          ['applicant_alternate_proposed', 'applicant'],
        ]
      );
      assert.equal(detail.negotiation.history?.[1].actor.name, 'Postulant');
    });

    it('M3 / M4 bundles return the applicant block to the applicant and the negotiation view to staff', async () => {
      const prelim = await import('../preliminary-evaluation/preliminary-evaluation.service.js');
      const formal = await import('../formal-request/formal-request.service.js');
      const d = await dossier();
      const dn = await user();
      await propose(d.phase.M3, dn);
      const formalId = await propose(d.phase.M4, dn, slot(), 'formal');
      await negotiation.confirmOnBehalf(formalId, dn, 'NOTE-INTERNE');

      const applicantM3 = (await prelim.getBundleForRequest(d.request, 'applicant')).meeting as unknown as Record<string, unknown>;
      assert.deepEqual(applicantM3.actions, ['confirm', 'propose_alternate']);
      assert.equal(applicantM3.negotiation, undefined);
      const staffM3 = (await prelim.getBundleForRequest(d.request, 'staff')).meeting as unknown as Record<string, unknown> & {
        negotiation: { availableNegotiationActions: string[] };
      };
      assert.deepEqual(staffM3.negotiation.availableNegotiationActions, ['confirm_on_behalf']);
      assert.equal(staffM3.actions, undefined);

      const applicantM4 = (await formal.getBundleForRequest(d.request, 'applicant')).meeting as unknown as Record<string, unknown>;
      assert.equal(applicantM4.confirmationStatus, 'confirmed');
      assert.equal(applicantM4.ticketAvailable, true);
      assert.doesNotMatch(JSON.stringify(applicantM4), /NOTE-INTERNE/);
      const staffM4 = (await formal.getBundleForRequest(d.request, 'staff')).meeting as { negotiation: { history: Array<{ remark: string | null }> } };
      assert.equal(staffM4.negotiation.history.at(-1)?.remark, 'NOTE-INTERNE');
    });

    it('no invitation before confirmation (409 code), for the applicant and the DN alike', async () => {
      const d = await dossier();
      const dn = await user();
      const id = await propose(d.phase.M3, dn);
      await assert.rejects(
        meetings.getMeetingInvitationPdf(id, { applicant: { applicantId: d.applicant } }),
        /MEETING_INVITATION_NOT_CONFIRMED/
      );
      await assert.rejects(meetings.getMeetingInvitationPdf(id, { user: { roles: ['dn_agent'] } }), /MEETING_INVITATION_NOT_CONFIRMED/);
      // IDOR unchanged: another applicant still gets MEETING_NOT_FOUND first.
      const intruder = await dossier();
      await assert.rejects(
        meetings.getMeetingInvitationPdf(id, { applicant: { applicantId: intruder.applicant } }),
        /MEETING_NOT_FOUND/
      );
    });

    it('the invitation is issued once confirmed, and for a site visit as before', async () => {
      const d = await dossier();
      const dn = await user();
      const id = await propose(d.phase.M3, dn);
      await negotiation.confirmMeeting(id, d.applicant);
      const confirmed = await meetings.getMeetingInvitationPdf(id, { applicant: { applicantId: d.applicant } });
      assert.equal(confirmed.pdf.subarray(0, 4).toString(), '%PDF');
      const { meeting: visit } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: dn,
        scheduledAt: slot().toISOString(),
        actorUserId: dn,
      });
      const visitPdf = await meetings.getMeetingInvitationPdf(visit.id, { applicant: { applicantId: d.applicant } });
      assert.equal(visitPdf.pdf.subarray(0, 4).toString(), '%PDF');
    });

    it('cockpit: planned counts only confirmed slots; waiting and counter-proposal counters; closed dossiers excluded', async () => {
      const d = await dossier();
      const closed = await dossier();
      const dn = await user();
      const at = slot(2);
      const awaiting = await propose(d.phase.M3, dn, at);
      const countered = await propose(d.phase.M4, dn, slot(2), 'formal');
      await negotiation.proposeAlternate(countered, d.applicant, { scheduledAt: slot(30).toISOString(), remark: 'r' });
      const closedCounter = await propose(closed.phase.M3, dn, slot(2));
      await negotiation.proposeAlternate(closedCounter, closed.applicant, { scheduledAt: slot(30).toISOString(), remark: 'r' });
      await pool.query(`UPDATE requests SET status = 'cancelled' WHERE id = $1`, [closed.request]);
      const { meeting: visit } = await site.scheduleSiteVisit({
        phaseId: d.phase.M6,
        r3AgentId: dn,
        scheduledAt: slot(2).toISOString(),
        actorUserId: dn,
      });

      const from = new Date(Date.now() + DAY).toISOString();
      const to = new Date(Date.now() + 4 * DAY).toISOString();
      const summary = await meetings.listMeetingCockpit({ from, to });
      const mineIds = new Set([awaiting, countered, closedCounter, visit.id]);
      const listed = summary.items.filter((item) => mineIds.has(item.id));
      assert.equal(listed.length, 4, 'all four slots are in the period list, confirmed or not');
      assert.equal(listed.find((i) => i.id === awaiting)?.negotiation.confirmationStatus, 'awaiting_applicant');
      assert.equal(listed.find((i) => i.id === awaiting)?.actionLabel, 'En attente du postulant');
      assert.equal(listed.find((i) => i.id === countered)?.actionLabel, 'Répondre à la contre-proposition');

      const pendingIds = summary.pendingNegotiations.map((i) => i.id);
      assert.ok(pendingIds.includes(awaiting) && pendingIds.includes(countered));
      assert.ok(!pendingIds.includes(closedCounter), 'closed dossier excluded');
      assert.ok(!pendingIds.includes(visit.id), 'site visits never negotiate');
      assert.ok(pendingIds.indexOf(countered) < pendingIds.indexOf(awaiting), 'counter-proposals first');

      // "Réunions prévues" = scheduled + operationally confirmed only.
      const filteredSummary = await meetings.listMeetingCockpit({ from, to, phaseCode: 'M6' });
      const planned = filteredSummary.metrics.find((m) => m.key === 'scheduled')!.value as number;
      const confirmedInPeriod = filteredSummary.items.filter(
        (i) => i.status === 'scheduled' && ['confirmed', 'not_required'].includes(i.negotiation.confirmationStatus)
      ).length;
      assert.equal(planned, confirmedInPeriod);
      const counter = summary.metrics.find((m) => m.key === 'counter_proposals')!;
      assert.ok((counter.value as number) >= 1);
      assert.equal(counter.tone, 'warning');
      assert.ok(summary.metrics.some((m) => m.key === 'awaiting_applicant'));

      const onlyCounters = await meetings.listMeetingCockpit({ from, to, confirmation: 'awaiting_dn' });
      assert.ok(onlyCounters.items.every((i) => i.negotiation.confirmationStatus === 'awaiting_dn'));
      assert.ok(onlyCounters.items.some((i) => i.id === countered));
    });

    it('the agent agenda is held by unconfirmed slots too', async () => {
      const d = await dossier();
      const other = await dossier();
      const dn = await user();
      const at = slot();
      await propose(d.phase.M3, dn, at);
      await assert.rejects(propose(other.phase.M3, dn, at), /MEETING_SLOT_CONFLICT/);
      const { softOverlapWarning } = await meetings.scheduleMeeting({
        phaseId: other.phase.M4,
        meetingType: 'formal',
        dnAgentId: dn,
        actorUserId: dn,
        scheduledAt: new Date(at.getTime() + 30_000).toISOString(),
      });
      assert.equal(softOverlapWarning, true);
    });

    it('phase closing stays blocked while the appointment is negotiated (status scheduled)', async () => {
      const phasesSvc = await import('../phases/phases.service.js');
      const d = await dossier();
      const dn = await user();
      const id = await propose(d.phase.M3, dn);
      await negotiation.proposeAlternate(id, d.applicant, { scheduledAt: slot().toISOString(), remark: 'r' });
      await assert.rejects(phasesSvc.closePhase(d.phase.M3, dn, {}), /MEETING_NOT_RESOLVED/);
    });
  });
});
