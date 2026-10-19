/** ROLE-ANALYTICS-1C - Courrier and Assistante DN providers on real
 *  PostgreSQL (skipped without DATABASE_URL). History is seeded in fixed past
 *  months (courrier: March 2019, DN circuit: March 2018) so the service totals
 *  are exact; current queue state is checked as a delta around the seeding,
 *  with circuits old enough (1998-1999) to be the oldest of any queue. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import type { RoleAnalyticsDomain, RoleAnalyticsOverview, RoleAnalyticsScope } from '@aidn/shared';
import { pgConnectionConfig } from '../../shared/db/connection.js';
import { resolveAnalyticsPeriod } from './period.js';
import type { RoleAnalyticsProvider } from './role-analytics.service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const NOW = new Date('2026-10-19T09:00:00Z');

describe('ROLE-ANALYTICS-1C providers (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  let courrier: RoleAnalyticsProvider;
  let dnCircuit: RoleAnalyticsProvider;
  const tag = Date.now().toString(36);
  let n = 0;
  const created = { users: [] as number[], organisations: [] as number[], applicants: [] as number[], requests: [] as number[] };

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    const [courrierModule, dnModule, dbModule] = await Promise.all([
      import('./providers/courrier.provider.js'),
      import('./providers/dn-circuit.provider.js'),
      import('../../shared/db/index.js'),
    ]);
    courrier = courrierModule.courrierAnalyticsProvider;
    dnCircuit = dnModule.dnCircuitAnalyticsProvider;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    // Every seeded audit row names a test user: deleted with the users below.
    if (created.users.length) await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [created.users]);
    if (created.requests.length) {
      await pool.query(`DELETE FROM dg_circuit_documents WHERE request_id = ANY($1)`, [created.requests]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [created.requests]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (created.users.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function user(label: string) {
    const k = `${tag}-${++n}`;
    const id = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, $2, $3) RETURNING id`, [
      `RA${k}`,
      label,
      `ra-${k}@test.local`,
    ])).id as number;
    created.users.push(id);
    return id;
  }

  async function dossier(status = 'in_progress') {
    const k = `${tag}-${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA RA ${k}`])).id as number;
    created.organisations.push(org);
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `ra-a-${k}@test.local`])).id as number;
    created.applicants.push(applicant);
    const reference = `DEM-RA-${k}`;
    const id = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [reference, applicant, org, status]
    )).id as number;
    created.requests.push(id);
    return { id, reference };
  }

  interface CircuitSeed {
    requestId: number;
    entityType: string;
    status: string;
    deposited?: string;
    sent?: string | null;
    signed?: string | null;
    pending?: string | null;
  }
  async function circuit(seed: CircuitSeed) {
    const deposited = seed.deposited ?? seed.sent ?? seed.pending ?? '2000-01-01T00:00:00Z';
    return (await one(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status, deposited_at, signature_sent_at, signed_at, pending_review_at)
       VALUES ($1, $2, $3, ($4::timestamptz AT TIME ZONE 'UTC'), ($5::timestamptz AT TIME ZONE 'UTC'), ($6::timestamptz AT TIME ZONE 'UTC'), ($7::timestamptz AT TIME ZONE 'UTC'))
       RETURNING id`,
      [seed.entityType, seed.requestId, seed.status, deposited, seed.sent ?? null, seed.signed ?? null, seed.pending ?? null]
    )).id as number;
  }

  /** The audit row: actor + action + entity, written at `createdAt` (which
   *  deliberately differs from the business timestamp). */
  async function audit(userId: number, action: string, entityId: number, requestId: number, createdAt: string) {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, module, entity_id, request_id, created_at)
       VALUES ($1, $2, 'M1', $3, $4, ($5::timestamptz AT TIME ZONE 'UTC'))`,
      [userId, action, entityId, requestId, createdAt]
    );
  }

  const context = (domain: RoleAnalyticsDomain, scope: RoleAnalyticsScope, userId: number, from: string, to: string) => ({
    domain,
    scope,
    viewer: { userId, roles: ['SU'] },
    now: NOW,
    period: resolveAnalyticsPeriod({ period: 'custom', from, to }, NOW),
  });
  const metric = (overview: RoleAnalyticsOverview, key: string) => overview.metrics.find((m) => m.key === key);
  const warning = (overview: RoleAnalyticsOverview, key: string) => overview.warnings.find((w) => w.key === key);
  const keys = (overview: RoleAnalyticsOverview) => overview.metrics.map((m) => m.key).sort();
  const assertNewestFirst = (overview: RoleAnalyticsOverview) => {
    for (let i = 1; i < overview.recentActivity.length; i += 1) {
      assert.ok(overview.recentActivity[i - 1].at >= overview.recentActivity[i].at, 'newest first');
    }
  };

  describe('courrier', () => {
    let agentA: number;
    let agentB: number;
    const req: Record<string, { id: number; reference: string }> = {};
    const March = ['2019-03-01', '2019-03-31'] as const;

    before(async () => {
      agentA = await user('Agent Courrier A');
      agentB = await user('Agent Courrier B');
      // C1 intake: sent by A (current alias, plus an older legacy alias by A for the same send), returned by B.
      req.C1 = await dossier();
      const c1 = await circuit({ requestId: req.C1.id, entityType: 'intake_request', status: 'pending_review', sent: '2019-03-05T10:00:00Z', signed: '2019-03-08T10:00:00Z', pending: '2019-03-08T10:00:00Z' });
      await audit(agentA, 'DG_CIRCUIT_SENT_TO_SIGNATURE', req.C1.id, req.C1.id, '2019-03-05T09:59:00Z');
      await audit(agentA, 'COURRIER_SENT_TO_SIGNATURE', c1, req.C1.id, '2019-03-05T12:30:00Z');
      await audit(agentB, 'DG_ANNOTATION_RETURNED', c1, req.C1.id, '2019-03-08T10:00:01Z');
      // C2 formal letter: sent by B, DG "signed" by A (FORMAL_LETTER_SIGNED), then handed to the DN (not a DG return).
      req.C2 = await dossier();
      const c2 = await circuit({ requestId: req.C2.id, entityType: 'formal_request_letter', status: 'pending_review', sent: '2019-03-10T10:00:00Z', signed: '2019-03-11T10:00:00Z', pending: '2019-03-12T10:00:00Z' });
      await audit(agentB, 'COURRIER_SENT_TO_SIGNATURE', c2, req.C2.id, '2019-03-10T10:00:01Z');
      await audit(agentA, 'FORMAL_LETTER_SIGNED', c2, req.C2.id, '2019-03-11T10:00:01Z');
      await audit(agentA, 'FORMAL_LETTER_TRANSMITTED', c2, req.C2.id, '2019-03-12T10:00:01Z');
      // C3 intake, legacy aliases keyed by the request id (DG_CIRCUIT_SENT_TO_SIGNATURE, DG_CIRCUIT_SIGNED_RETURNED).
      req.C3 = await dossier();
      await circuit({ requestId: req.C3.id, entityType: 'intake_request', status: 'pending_review', sent: '2019-03-02T10:00:00Z', signed: '2019-03-20T10:00:00Z', pending: '2019-03-20T10:00:00Z' });
      await audit(agentA, 'DG_CIRCUIT_SENT_TO_SIGNATURE', req.C3.id, req.C3.id, '2019-03-02T10:00:01Z');
      await audit(agentA, 'DG_CIRCUIT_SIGNED_RETURNED', req.C3.id, req.C3.id, '2019-03-20T10:00:01Z');
      // C5 pre-evaluation: sent by A, still with the DG (incomplete: no return, no duration).
      req.C5 = await dossier();
      const c5 = await circuit({ requestId: req.C5.id, entityType: 'pre_evaluation', status: 'in_signature_circuit', sent: '2019-03-25T10:00:00Z' });
      await audit(agentA, 'COURRIER_SENT_TO_SIGNATURE', c5, req.C5.id, '2019-03-25T10:00:01Z');
      // C6: sent before the period (February), returned in March by B: return + duration count, the send does not.
      req.C6 = await dossier();
      const c6 = await circuit({ requestId: req.C6.id, entityType: 'pre_evaluation', status: 'pending_review', sent: '2019-02-20T10:00:00Z', signed: '2019-03-03T10:00:00Z', pending: '2019-03-03T10:00:00Z' });
      await audit(agentB, 'COURRIER_SENT_TO_SIGNATURE', c6, req.C6.id, '2019-02-20T10:00:01Z');
      await audit(agentB, 'COURRIER_SIGNED_RETURNED', c6, req.C6.id, '2019-03-03T10:00:01Z');
      // C7 on a now-rejected dossier: history keeps it.
      req.C7 = await dossier('rejected');
      const c7 = await circuit({ requestId: req.C7.id, entityType: 'intake_request', status: 'pending_review', sent: '2019-03-06T10:00:00Z', signed: '2019-03-07T10:00:00Z', pending: '2019-03-07T10:00:00Z' });
      await audit(agentA, 'COURRIER_SENT_TO_SIGNATURE', c7, req.C7.id, '2019-03-06T10:00:01Z');
      await audit(agentB, 'DG_ANNOTATION_RETURNED', c7, req.C7.id, '2019-03-07T10:00:01Z');
      // C8: sent in March with no audit row at all: service counts it, nobody's "mine" does.
      req.C8 = await dossier();
      await circuit({ requestId: req.C8.id, entityType: 'formal_request_letter', status: 'in_signature_circuit', sent: '2019-03-12T10:00:00Z' });
      // C9: sent in the previous period only.
      req.C9 = await dossier();
      const c9 = await circuit({ requestId: req.C9.id, entityType: 'intake_request', status: 'in_signature_circuit', sent: '2019-02-10T10:00:00Z' });
      await audit(agentA, 'COURRIER_SENT_TO_SIGNATURE', c9, req.C9.id, '2019-02-10T10:00:01Z');
    });

    it('service: sends and DG returns in the period, by business timestamp, with the previous period', async () => {
      const overview = await courrier.getOverview(context('courrier', 'service', agentA, ...March));
      assert.equal(overview.domain, 'courrier');
      assert.equal(overview.scope, 'service');
      const sent = metric(overview, 'courrier.sent_to_dg');
      assert.deepEqual(
        { value: sent?.value, unit: sent?.unit, basis: sent?.basis, reliability: sent?.reliability, previousValue: sent?.previousValue },
        { value: 6, unit: 'count', basis: 'period', reliability: 'reliable', previousValue: 2 }
      );
      const returned = metric(overview, 'courrier.dg_return_recorded');
      assert.equal(returned?.value, 5, 'C1, C2 (FORMAL_LETTER_SIGNED), C3 (legacy), C6, C7; never the DN hand-over');
      assert.equal(returned?.previousValue, 0);
    });

    it('service: average DG circuit duration, completed in the period, incomplete circuits excluded', async () => {
      const overview = await courrier.getOverview(context('courrier', 'service', agentA, ...March));
      const duration = metric(overview, 'courrier.average_dg_circuit_duration');
      assert.deepEqual(
        { value: duration?.value, unit: duration?.unit, basis: duration?.basis, sampleSize: duration?.sampleSize, reliability: duration?.reliability },
        { value: 6.8, unit: 'calendar_days', basis: 'period', sampleSize: 5, reliability: 'reliable' }
      );
    });

    it('mine: only the events the audit attributes to the viewer (current and legacy aliases, never twice)', async () => {
      const mineA = await courrier.getOverview(context('courrier', 'mine', agentA, ...March));
      assert.equal(metric(mineA, 'courrier.sent_to_dg')?.value, 4, 'C1 (two aliases, once), C3 legacy, C5, C7; not B\'s C2, not the unaudited C8');
      assert.equal(metric(mineA, 'courrier.sent_to_dg')?.previousValue, 1, 'C9');
      assert.equal(metric(mineA, 'courrier.dg_return_recorded')?.value, 2, 'C2 formal, C3 legacy');
      const mineB = await courrier.getOverview(context('courrier', 'mine', agentB, ...March));
      assert.equal(metric(mineB, 'courrier.sent_to_dg')?.value, 1);
      assert.equal(metric(mineB, 'courrier.dg_return_recorded')?.value, 3, 'C1, C6, C7');
    });

    it('mine: no service duration, no shared queue metric or warning', async () => {
      const mine = await courrier.getOverview(context('courrier', 'mine', agentA, ...March));
      assert.deepEqual(keys(mine), ['courrier.dg_return_recorded', 'courrier.sent_to_dg']);
      assert.deepEqual(mine.warnings, []);
    });

    it('recent activity: semantic events, row timestamps, audit actors, newest first, capped at 10', async () => {
      const service = await courrier.getOverview(context('courrier', 'service', agentA, ...March));
      assert.equal(service.recentActivity.length, 10, '11 events in March, capped');
      assertNewestFirst(service);
      const first = service.recentActivity[0];
      assert.deepEqual(first, {
        at: '2019-03-25T10:00:00.000Z',
        eventKey: 'courrier.sent_to_dg',
        actor: { kind: 'staff', userId: agentA, fullName: 'Agent Courrier A' },
        requestId: req.C5.id,
        requestReference: req.C5.reference,
        href: `/courriers?tab=all&id=pre_evaluation:${req.C5.id}`,
      });
      const c8 = service.recentActivity.find((a) => a.requestId === req.C8.id);
      assert.equal(c8?.actor, null, 'no audit row: no invented actor');
      const c1Sends = service.recentActivity.filter((a) => a.requestId === req.C1.id && a.eventKey === 'courrier.sent_to_dg');
      assert.equal(c1Sends.length, 1, 'two aliases, one business event');
      assert.equal(c1Sends[0].at, '2019-03-05T10:00:00.000Z', 'business timestamp, not the audit time');

      const mine = await courrier.getOverview(context('courrier', 'mine', agentA, ...March));
      assertNewestFirst(mine);
      assert.equal(mine.recentActivity.length, 6);
      assert.ok(mine.recentActivity.every((a) => a.actor?.kind === 'staff' && a.actor.userId === agentA));
    });

    it('an empty period: zero counts, no duration (null, sample 0), no activity', async () => {
      const overview = await courrier.getOverview(context('courrier', 'service', agentA, '2017-01-01', '2017-01-31'));
      assert.equal(metric(overview, 'courrier.sent_to_dg')?.value, 0);
      assert.equal(metric(overview, 'courrier.dg_return_recorded')?.value, 0);
      const duration = metric(overview, 'courrier.average_dg_circuit_duration');
      assert.equal(duration?.value, null);
      assert.equal(duration?.sampleSize, 0);
      assert.deepEqual(overview.recentActivity, []);
    });

    it('current state from the courrier queue: to_print backlog, overdue DG returns, oldest; closed dossiers excluded', async () => {
      const ctx = context('courrier', 'service', agentA, ...March);
      const before = await courrier.getOverview(ctx);
      const open = await dossier();
      const closed = await dossier('cancelled');
      await circuit({ requestId: open.id, entityType: 'intake_request', status: 'in_signature_circuit', deposited: '1999-05-30T10:00:00Z', sent: '1999-06-01T10:00:00Z' });
      await circuit({ requestId: closed.id, entityType: 'intake_request', status: 'in_signature_circuit', deposited: '1998-05-30T10:00:00Z', sent: '1998-06-01T10:00:00Z' });
      const printOpen = await dossier();
      const printClosed = await dossier('rejected');
      await circuit({ requestId: printOpen.id, entityType: 'intake_request', status: 'submitted', deposited: new Date().toISOString() });
      await circuit({ requestId: printClosed.id, entityType: 'intake_request', status: 'submitted', deposited: new Date().toISOString() });
      const after = await courrier.getOverview(ctx);

      const backlog = metric(after, 'courrier.to_print_backlog');
      assert.equal(backlog?.basis, 'current');
      assert.equal(backlog?.unit, 'count');
      assert.equal((backlog?.value ?? 0) - (metric(before, 'courrier.to_print_backlog')?.value ?? 0), 1, 'the closed dossier is not a backlog');
      assert.equal(
        (metric(after, 'courrier.dg_return_overdue')?.value ?? 0) - (metric(before, 'courrier.dg_return_overdue')?.value ?? 0),
        1
      );
      const overdue = warning(after, 'courrier.dg_return_overdue');
      assert.equal(overdue?.severity, 'danger');
      assert.equal(overdue?.oldest?.requestId, open.id, 'the closed 1998 circuit is not a current blocker');
      assert.equal(overdue?.oldest?.since, '1999-06-01T10:00:00.000Z');
      assert.equal(overdue?.href, `/courriers?tab=with_dg&id=intake_request:${open.id}`);
      const oldest = warning(after, 'courrier.dg_return_oldest');
      assert.equal(oldest?.severity, 'info');
      assert.equal(oldest?.oldest?.requestReference, open.reference);
      assert.equal(oldest?.oldest?.itemId, `intake_request:${open.id}`);
      // History is untouched by the current seeds (1999 / now are outside March 2019).
      assert.equal(metric(after, 'courrier.sent_to_dg')?.value, 6);
    });
  });

  describe('dn_circuit', () => {
    let agentX: number;
    let agentY: number;
    const req: Record<string, { id: number; reference: string }> = {};
    const March = ['2018-03-01', '2018-03-31'] as const;

    async function dnCase(
      key: string,
      opts: { status?: string; intakeSigned: string; dn: Omit<CircuitSeed, 'requestId' | 'entityType'>; sentBy?: number; returnedBy?: number }
    ) {
      req[key] = await dossier(opts.status);
      await circuit({ requestId: req[key].id, entityType: 'intake_request', status: 'pending_review', sent: '2018-01-02T10:00:00Z', signed: opts.intakeSigned, pending: opts.intakeSigned });
      const id = await circuit({ requestId: req[key].id, entityType: 'dn_director_annotation', deposited: opts.intakeSigned, ...opts.dn });
      if (opts.sentBy && opts.dn.sent) await audit(opts.sentBy, 'DN_ANNOTATION_SENT_TO_DIRECTOR', id, req[key].id, '2018-12-31T00:00:00Z');
      if (opts.returnedBy && opts.dn.pending) await audit(opts.returnedBy, 'DN_ANNOTATION_RETURNED', id, req[key].id, '2018-12-31T00:00:01Z');
    }

    before(async () => {
      agentX = await user('Assistante DN X');
      agentY = await user('Assistante DN Y');
      await dnCase('D1', { intakeSigned: '2018-03-01T08:00:00Z', dn: { status: 'pending_review', sent: '2018-03-04T08:00:00Z', pending: '2018-03-06T08:00:00Z' }, sentBy: agentX, returnedBy: agentY });
      await dnCase('D2', { intakeSigned: '2018-02-27T08:00:00Z', dn: { status: 'pending_review', sent: '2018-03-10T08:00:00Z', pending: '2018-03-15T08:00:00Z' }, sentBy: agentY, returnedBy: agentX });
      // D3: grandfathered dossier (backfill): returned without ever being sent to the Directeur DN.
      await dnCase('D3', { intakeSigned: '2018-03-01T09:00:00Z', dn: { status: 'pending_review', pending: '2018-03-05T08:00:00Z' } });
      await dnCase('D4', { intakeSigned: '2018-03-19T08:00:00Z', dn: { status: 'in_signature_circuit', sent: '2018-03-20T08:00:00Z' }, sentBy: agentX });
      await dnCase('D5', { intakeSigned: '2018-02-19T08:00:00Z', dn: { status: 'pending_review', sent: '2018-02-20T08:00:00Z', pending: '2018-03-02T08:00:00Z' }, sentBy: agentX, returnedBy: agentY });
      await dnCase('D6', { status: 'completed', intakeSigned: '2018-03-07T08:00:00Z', dn: { status: 'pending_review', sent: '2018-03-08T08:00:00Z', pending: '2018-03-09T08:00:00Z' }, sentBy: agentX, returnedBy: agentX });
    });

    it('service: sent to and returned from the Directeur DN, grandfathered dossiers excluded', async () => {
      const overview = await dnCircuit.getOverview(context('dn_circuit', 'service', agentX, ...March));
      const sent = metric(overview, 'dn_circuit.sent_to_director');
      assert.equal(sent?.value, 4, 'D1, D2, D4, D6 (now closed)');
      assert.equal(sent?.previousValue, 1, 'D5');
      assert.equal(metric(overview, 'dn_circuit.return_recorded')?.value, 4, 'D1, D2, D5, D6; never D3');
    });

    it('service: average time with the Directeur DN and DG-return -> hand-over delay, informational', async () => {
      const overview = await dnCircuit.getOverview(context('dn_circuit', 'service', agentX, ...March));
      const director = metric(overview, 'dn_circuit.average_director_duration');
      assert.deepEqual(
        { value: director?.value, unit: director?.unit, sampleSize: director?.sampleSize, reliability: director?.reliability },
        { value: 4.5, unit: 'calendar_days', sampleSize: 4, reliability: 'reliable' }
      );
      const handoff = metric(overview, 'dn_circuit.average_handoff_delay');
      assert.deepEqual(
        { value: handoff?.value, unit: handoff?.unit, sampleSize: handoff?.sampleSize },
        { value: 4, unit: 'calendar_days', sampleSize: 4 },
        'D1 3, D2 11, D4 1, D6 1; D5 was sent in February'
      );
    });

    it('mine: attribution through the audit, nobody else\'s events', async () => {
      const mineX = await dnCircuit.getOverview(context('dn_circuit', 'mine', agentX, ...March));
      assert.equal(metric(mineX, 'dn_circuit.sent_to_director')?.value, 3, 'D1, D4, D6');
      assert.equal(metric(mineX, 'dn_circuit.return_recorded')?.value, 2, 'D2, D6');
      assert.deepEqual(keys(mineX), ['dn_circuit.return_recorded', 'dn_circuit.sent_to_director']);
      assert.deepEqual(mineX.warnings, []);
      const mineY = await dnCircuit.getOverview(context('dn_circuit', 'mine', agentY, ...March));
      assert.equal(metric(mineY, 'dn_circuit.sent_to_director')?.value, 1);
      assert.equal(metric(mineY, 'dn_circuit.return_recorded')?.value, 2, 'D1, D5');
      assert.ok(mineY.recentActivity.every((a) => a.actor?.kind === 'staff' && a.actor.userId === agentY));
    });

    it('recent activity: newest first, semantic keys, DN circuit links', async () => {
      const overview = await dnCircuit.getOverview(context('dn_circuit', 'service', agentX, ...March));
      assert.equal(overview.recentActivity.length, 8);
      assertNewestFirst(overview);
      assert.deepEqual(overview.recentActivity[0], {
        at: '2018-03-20T08:00:00.000Z',
        eventKey: 'dn_circuit.sent_to_director',
        actor: { kind: 'staff', userId: agentX, fullName: 'Assistante DN X' },
        requestId: req.D4.id,
        requestReference: req.D4.reference,
        href: `/circuit-directeur-dn?tab=all&id=dn_director_annotation:${req.D4.id}`,
      });
      assert.ok(!overview.recentActivity.some((a) => a.requestId === req.D3.id));
    });

    it('current state: with_director count and oldest item, info only (no Directeur DN SLA); closed dossiers excluded', async () => {
      const ctx = context('dn_circuit', 'service', agentX, ...March);
      const before = await dnCircuit.getOverview(ctx);
      const open = await dossier();
      const closed = await dossier('rejected');
      await circuit({ requestId: open.id, entityType: 'dn_director_annotation', status: 'in_signature_circuit', deposited: '1999-05-30T10:00:00Z', sent: '1999-06-01T10:00:00Z' });
      await circuit({ requestId: closed.id, entityType: 'dn_director_annotation', status: 'in_signature_circuit', deposited: '1998-05-30T10:00:00Z', sent: '1998-06-01T10:00:00Z' });
      const after = await dnCircuit.getOverview(ctx);
      const withDirector = metric(after, 'dn_circuit.with_director');
      assert.equal(withDirector?.basis, 'current');
      assert.equal((withDirector?.value ?? 0) - (metric(before, 'dn_circuit.with_director')?.value ?? 0), 1);
      const oldest = warning(after, 'dn_circuit.with_director_oldest');
      assert.equal(oldest?.severity, 'info');
      assert.equal(oldest?.oldest?.requestId, open.id);
      assert.equal(oldest?.oldest?.since, '1999-06-01T10:00:00.000Z');
      assert.equal(oldest?.href, `/circuit-directeur-dn?tab=with_director&id=dn_director_annotation:${open.id}`);
      assert.ok(after.warnings.every((w) => w.severity === 'info'), 'no invented Directeur DN SLA');
      assert.ok(!after.metrics.some((m) => m.key.includes('overdue')));
    });
  });
});
