/** ROLE-ANALYTICS-1D - Finance provider on real PostgreSQL (skipped without
 *  DATABASE_URL). History is seeded in March 2016 (previous period: the 31
 *  days before), so the service totals are exact; the current queue is
 *  checked as a delta around the seeding, with proofs old enough (1998-1999)
 *  to be the oldest of the queue. */
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
const MARCH = ['2016-03-01', '2016-03-31'] as const;

describe('ROLE-ANALYTICS-1D finance provider (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  let finance: RoleAnalyticsProvider;
  const tag = Date.now().toString(36);
  let n = 0;
  const created = { users: [] as number[], organisations: [] as number[], applicants: [] as number[], requests: [] as number[] };
  let s1: number;
  let s2: number;
  const pay: Record<string, { requestId: number; reference: string; phaseId: number; paymentId: number }> = {};

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    const [financeModule, dbModule] = await Promise.all([
      import('./providers/finance.provider.js'),
      import('../../shared/db/index.js'),
    ]);
    finance = financeModule.financeAnalyticsProvider;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    const requests = created.requests;
    if (requests.length) {
      const paymentIds = `SELECT p.id FROM payments p JOIN phases ph ON ph.id = p.phase_id WHERE ph.request_id = ANY($1)`;
      // Proof uploads have no actor: deleted by payment, not by user.
      await pool.query(`DELETE FROM audit_logs WHERE action LIKE ANY (ARRAY['INVOICE_%', 'PAYMENT_%']) AND entity_id IN (${paymentIds})`, [requests]);
      await pool.query(`DELETE FROM payments WHERE id IN (${paymentIds})`, [requests]);
      await pool.query(`DELETE FROM phases WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [requests]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (created.users.length) {
      await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [created.users]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const ts = (value: string | null | undefined) => value ?? null;

  async function user(label: string) {
    const k = `${tag}-${++n}`;
    const id = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, $2, $3) RETURNING id`, [`RF${k}`, label, `rf-${k}@test.local`])).id as number;
    created.users.push(id);
    return id;
  }

  interface PaymentSeed {
    phaseCode: 'M5' | 'M6' | 'M7';
    dossierStatus?: string;
    status: string;
    phaseOpened?: string;
    invoiceAt?: string;
    proofAt?: string | null;
    validatedAt?: string | null;
    validatedBy?: number | null;
  }

  async function payment(key: string, seed: PaymentSeed) {
    const k = `${tag}-${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA RF ${k}`])).id as number;
    created.organisations.push(org);
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `rf-a-${k}@test.local`])).id as number;
    created.applicants.push(applicant);
    const reference = `DEM-RF-${k}`;
    const requestId = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [reference, applicant, org, seed.dossierStatus ?? 'in_progress']
    )).id as number;
    created.requests.push(requestId);
    const phaseId = (await one(
      `INSERT INTO phases (request_id, phase_code, status, opened_at) VALUES ($1, $2, 'open', ($3::timestamptz AT TIME ZONE 'UTC')) RETURNING id`,
      [requestId, seed.phaseCode, seed.phaseOpened ?? '2016-01-01T00:00:00Z']
    )).id as number;
    const paymentId = (await one(
      `INSERT INTO payments (phase_id, status, invoice_file_url, invoice_uploaded_at, proof_file_url, proof_uploaded_at, validated_by, validated_at)
       VALUES ($1, $2, $3, ($4::timestamptz AT TIME ZONE 'UTC'), $5, ($6::timestamptz AT TIME ZONE 'UTC'), $7, ($8::timestamptz AT TIME ZONE 'UTC'))
       RETURNING id`,
      [
        phaseId,
        seed.status,
        seed.invoiceAt ? '/x/invoice.pdf' : null,
        ts(seed.invoiceAt),
        seed.proofAt ? '/x/proof.pdf' : null,
        ts(seed.proofAt),
        seed.validatedBy ?? null,
        ts(seed.validatedAt),
      ]
    )).id as number;
    pay[key] = { requestId, reference, phaseId, paymentId };
    return pay[key];
  }

  /** An audit row written at `createdAt`; `userId` null = applicant action. */
  async function audit(key: string, action: string, userId: number | null, createdAt: string) {
    const p = pay[key];
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, module, entity_id, request_id, created_at)
       VALUES ($1, $2, (SELECT phase_code::text FROM phases WHERE id = $3), $4, $5, ($6::timestamptz AT TIME ZONE 'UTC'))`,
      [userId, action, p.phaseId, p.paymentId, p.requestId, createdAt]
    );
  }

  const context = (scope: RoleAnalyticsScope, userId: number, from: string = MARCH[0], to: string = MARCH[1]) => ({
    domain: 'finance' as const,
    scope,
    viewer: { userId, roles: ['s5_agent'] },
    now: NOW,
    period: resolveAnalyticsPeriod({ period: 'custom', from, to }, NOW),
  });
  const metric = (overview: RoleAnalyticsOverview, key: string) => overview.metrics.find((m) => m.key === key);
  const value = (overview: RoleAnalyticsOverview, key: string) => metric(overview, key)?.value;

  before(async () => {
    s1 = await user('Agent S5 Un');
    s2 = await user('Agent S5 Deux');
    // P1 M5: invoice by S1, proof (applicant), validated by S1 three days after the proof.
    await payment('P1', { phaseCode: 'M5', status: 'validated', invoiceAt: '2016-03-01T10:00:00Z', proofAt: '2016-03-02T10:00:00Z', validatedAt: '2016-03-05T10:00:00Z', validatedBy: s1 });
    await audit('P1', 'INVOICE_UPLOADED', s1, '2016-03-01T10:00:00Z');
    await audit('P1', 'PAYMENT_PROOF_UPLOADED', null, '2016-03-02T10:00:00Z');
    await audit('P1', 'PAYMENT_VALIDATED', s1, '2016-03-05T10:00:00Z');
    // P2 M6: two invoice uploads by S2, a proof rejected by S1, a new proof, validated by S2.
    await payment('P2', { phaseCode: 'M6', status: 'validated', invoiceAt: '2016-03-04T10:00:00Z', proofAt: '2016-03-09T10:00:00Z', validatedAt: '2016-03-10T10:00:00Z', validatedBy: s2 });
    await audit('P2', 'INVOICE_UPLOADED', s2, '2016-03-03T10:00:00Z');
    await audit('P2', 'INVOICE_UPLOADED', s2, '2016-03-04T10:00:00Z');
    await audit('P2', 'PAYMENT_PROOF_UPLOADED', null, '2016-03-06T10:00:00Z');
    await audit('P2', 'PAYMENT_REJECTED', s1, '2016-03-07T10:00:00Z');
    await audit('P2', 'PAYMENT_PROOF_UPLOADED', null, '2016-03-09T10:00:00Z');
    await audit('P2', 'PAYMENT_VALIDATED', s2, '2016-03-10T10:00:00Z');
    // P3 M7: validated by S1 with a proof timestamp after the validation (malformed pair).
    await payment('P3', { phaseCode: 'M7', status: 'validated', invoiceAt: '2016-02-01T10:00:00Z', proofAt: '2016-03-21T10:00:00Z', validatedAt: '2016-03-20T10:00:00Z', validatedBy: s1 });
    // P4 M5: validated by S1 in the previous period.
    await payment('P4', { phaseCode: 'M5', status: 'validated', invoiceAt: '2016-02-01T10:00:00Z', proofAt: '2016-02-10T10:00:00Z', validatedAt: '2016-02-15T10:00:00Z', validatedBy: s1 });
    // P5 M6 on a now-rejected dossier: rejected (reject_dossier) by S2; history keeps it.
    await payment('P5', { phaseCode: 'M6', dossierStatus: 'rejected', status: 'rejected', invoiceAt: '2016-02-01T10:00:00Z', proofAt: '2016-03-11T10:00:00Z' });
    await audit('P5', 'PAYMENT_REJECTED', s2, '2016-03-12T10:00:00Z');
    // P6 M5: validated in March without a recorded validator (legacy row): service only.
    await payment('P6', { phaseCode: 'M5', status: 'validated', invoiceAt: '2016-02-01T10:00:00Z', proofAt: '2016-03-14T10:00:00Z', validatedAt: '2016-03-15T10:00:00Z' });
    // P7: an invoice uploaded by S1 in the previous period.
    await payment('P7', { phaseCode: 'M7', status: 'awaiting_proof', dossierStatus: 'completed', invoiceAt: '2016-02-20T10:00:00Z' });
    await audit('P7', 'INVOICE_UPLOADED', s1, '2016-02-20T10:00:00Z');
  });

  it('validations: service count by validatedAt, split by phase, with the previous period, reliable', async () => {
    const overview = await finance.getOverview(context('service', s1));
    const validated = metric(overview, 'finance.payment_validated');
    assert.deepEqual(
      { value: validated?.value, basis: validated?.basis, reliability: validated?.reliability, previousValue: validated?.previousValue },
      { value: 4, basis: 'period', reliability: 'reliable', previousValue: 1 },
      'P1, P2, P3, P6; previous: P4'
    );
    assert.equal(value(overview, 'finance.m5_validated'), 2);
    assert.equal(value(overview, 'finance.m6_validated'), 1);
    assert.equal(value(overview, 'finance.m7_validated'), 1);
  });

  it('validations: mine = validatedBy, another validator and unattributed rows excluded', async () => {
    const mine1 = await finance.getOverview(context('mine', s1));
    assert.equal(value(mine1, 'finance.payment_validated'), 2, 'P1, P3');
    assert.equal(metric(mine1, 'finance.payment_validated')?.previousValue, 1, 'P4');
    assert.deepEqual(
      [value(mine1, 'finance.m5_validated'), value(mine1, 'finance.m6_validated'), value(mine1, 'finance.m7_validated')],
      [1, 0, 1]
    );
    const mine2 = await finance.getOverview(context('mine', s2));
    assert.equal(value(mine2, 'finance.payment_validated'), 1, 'P2');
  });

  it('invoice uploads: every audited upload is an event (re-uploads included), audit-timed caveat', async () => {
    const service = await finance.getOverview(context('service', s1));
    const invoices = metric(service, 'finance.invoice_uploaded');
    assert.deepEqual(
      { value: invoices?.value, previousValue: invoices?.previousValue, reliability: invoices?.reliability, caveatKey: invoices?.caveatKey },
      { value: 3, previousValue: 1, reliability: 'caveat', caveatKey: 'legacy_db_timezone' },
      'P1 once, P2 twice; previous: P7'
    );
    assert.equal(value(await finance.getOverview(context('mine', s2)), 'finance.invoice_uploaded'), 2);
    assert.equal(value(await finance.getOverview(context('mine', s1)), 'finance.invoice_uploaded'), 1);
  });

  it('proofs received: applicant uploads, service only, never in a staff member\'s mine', async () => {
    const service = await finance.getOverview(context('service', s1));
    const proofs = metric(service, 'finance.proof_received');
    assert.equal(proofs?.value, 3, 'P1, P2 twice (each upload is an event)');
    assert.equal(proofs?.reliability, 'caveat');
    const mine = await finance.getOverview(context('mine', s1));
    assert.equal(metric(mine, 'finance.proof_received'), undefined);
    assert.ok(!mine.recentActivity.some((a) => a.eventKey === 'finance.proof_uploaded'));
    const proofActivity = service.recentActivity.filter((a) => a.eventKey === 'finance.proof_uploaded');
    assert.ok(proofActivity.length > 0);
    assert.ok(proofActivity.every((a) => a.actor?.kind === 'applicant'), 'an applicant action, no invented identity');
  });

  it('rejections: audit-only events, mine by audit user, each rejection once, closed dossiers kept', async () => {
    const service = await finance.getOverview(context('service', s1));
    const rejected = metric(service, 'finance.payment_rejected');
    assert.deepEqual(
      { value: rejected?.value, reliability: rejected?.reliability, caveatKey: rejected?.caveatKey },
      { value: 2, reliability: 'caveat', caveatKey: 'legacy_db_timezone' },
      'P2 (S1), P5 (S2, dossier now rejected)'
    );
    assert.equal(value(await finance.getOverview(context('mine', s1)), 'finance.payment_rejected'), 1);
    assert.equal(value(await finance.getOverview(context('mine', s2)), 'finance.payment_rejected'), 1);
    const p5 = service.recentActivity.filter((a) => a.requestId === pay.P5.requestId);
    assert.deepEqual(p5.map((a) => [a.eventKey, a.at]), [['finance.payment_rejected', '2016-03-12T10:00:00.000Z']]);
  });

  it('validation delay: latest proof -> validation, completed in the period, malformed pair excluded, caveat', async () => {
    const service = await finance.getOverview(context('service', s1));
    const delay = metric(service, 'finance.average_validation_delay');
    assert.deepEqual(
      { value: delay?.value, unit: delay?.unit, sampleSize: delay?.sampleSize, reliability: delay?.reliability, caveatKey: delay?.caveatKey },
      { value: 1.7, unit: 'calendar_days', sampleSize: 3, reliability: 'caveat', caveatKey: 'latest_proof_only' },
      'P1 3, P2 1, P6 1; P3 (proof after validation) left out'
    );
  });

  it('mine carries only attributed history: no queue, no delay, no proof receipts, no warning', async () => {
    const mine = await finance.getOverview(context('mine', s1));
    assert.deepEqual(mine.metrics.map((m) => m.key).sort(), [
      'finance.invoice_uploaded',
      'finance.m5_validated',
      'finance.m6_validated',
      'finance.m7_validated',
      'finance.payment_rejected',
      'finance.payment_validated',
    ]);
    assert.ok(mine.metrics.every((m) => m.basis === 'period'));
    assert.deepEqual(mine.warnings, []);
  });

  it('recent activity: newest first, capped at 10, semantic keys, validations from the row (never twice)', async () => {
    const service = await finance.getOverview(context('service', s1));
    assert.equal(service.recentActivity.length, 10, '12 events in March, capped');
    for (let i = 1; i < service.recentActivity.length; i += 1) {
      assert.ok(service.recentActivity[i - 1].at >= service.recentActivity[i].at);
    }
    assert.deepEqual(service.recentActivity[0], {
      at: '2016-03-20T10:00:00.000Z',
      eventKey: 'finance.payment_validated',
      actor: { kind: 'staff', userId: s1, fullName: 'Agent S5 Un' },
      requestId: pay.P3.requestId,
      requestReference: pay.P3.reference,
      href: `/paiements-s5?tab=all&id=M7:${pay.P3.phaseId}`,
    });
    const p2Validations = service.recentActivity.filter((a) => a.requestId === pay.P2.requestId && a.eventKey === 'finance.payment_validated');
    assert.equal(p2Validations.length, 1, 'the PAYMENT_VALIDATED audit row is not a second event');
    const p6 = service.recentActivity.find((a) => a.requestId === pay.P6.requestId);
    assert.equal(p6?.actor, null, 'no validator recorded: no invented actor');

    const mine = await finance.getOverview(context('mine', s1));
    assert.deepEqual(
      mine.recentActivity.map((a) => [a.eventKey, a.requestId]),
      [
        ['finance.payment_validated', pay.P3.requestId],
        ['finance.payment_rejected', pay.P2.requestId],
        ['finance.payment_validated', pay.P1.requestId],
        ['finance.invoice_uploaded', pay.P1.requestId],
      ]
    );
  });

  it('an empty period: zero counts, no delay (null, sample 0), no activity', async () => {
    const overview = await finance.getOverview(context('service', s1, '2015-01-01', '2015-01-31'));
    for (const key of ['finance.payment_validated', 'finance.m5_validated', 'finance.invoice_uploaded', 'finance.proof_received', 'finance.payment_rejected']) {
      assert.equal(value(overview, key), 0, key);
    }
    const delay = metric(overview, 'finance.average_validation_delay');
    assert.equal(delay?.value, null);
    assert.equal(delay?.sampleSize, 0);
    assert.deepEqual(overview.recentActivity, []);
  });

  it('current state from the Finance queue: proofs to validate, overdue, oldest; closed dossiers excluded', async () => {
    const ctx = context('service', s1);
    const before = await finance.getOverview(ctx);
    const open = await payment('Q1', { phaseCode: 'M6', status: 'pending_validation', invoiceAt: '1999-05-01T10:00:00Z', proofAt: '1999-06-01T10:00:00Z' });
    await payment('Q2', { phaseCode: 'M6', dossierStatus: 'cancelled', status: 'pending_validation', invoiceAt: '1998-05-01T10:00:00Z', proofAt: '1998-06-01T10:00:00Z' });
    await payment('Q3', { phaseCode: 'M5', status: 'awaiting_invoice', phaseOpened: new Date().toISOString() });
    await payment('Q4', { phaseCode: 'M5', dossierStatus: 'rejected', status: 'awaiting_invoice', phaseOpened: new Date().toISOString() });
    const after = await finance.getOverview(ctx);

    const delta = (key: string) => (value(after, key) ?? 0) - (value(before, key) ?? 0);
    assert.equal(metric(after, 'finance.proof_to_validate')?.basis, 'current');
    assert.equal(delta('finance.proof_to_validate'), 1, 'the cancelled dossier is not waiting');
    assert.equal(delta('finance.proof_overdue'), 1);
    assert.equal(delta('finance.invoice_to_send'), 1);
    const overdue = after.warnings.find((w) => w.key === 'finance.proof_overdue');
    assert.equal(overdue?.severity, 'danger');
    assert.equal(overdue?.oldest?.requestId, open.requestId, 'the closed 1998 proof is not a current blocker');
    assert.equal(overdue?.oldest?.since, '1999-06-01T10:00:00.000Z');
    assert.equal(overdue?.oldest?.itemId, `M6:${open.phaseId}`);
    assert.equal(overdue?.href, `/paiements-s5?tab=proof_to_validate&id=M6:${open.phaseId}`);
    assert.ok(!after.metrics.some((m) => m.key.includes('invoice') && m.key.includes('overdue')), 'no invented invoice deadline');
    // History is untouched by the current seeds.
    assert.equal(value(after, 'finance.payment_validated'), 4);
  });
});
