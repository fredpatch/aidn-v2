/** K4 - payment decisions against a real PostgreSQL (skipped without
 *  DATABASE_URL, like every DB-backed check: run it on a migrated, disposable
 *  database, e.g. `DATABASE_URL=postgresql://…/aidn_verify npm test`).
 *
 *  Races are made deterministic with a second connection that holds the
 *  payment row lock while the service call is waiting on it. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

type Code = 'M5' | 'M6' | 'M7';
type Services = Record<
  Code,
  {
    validatePayment: (phaseId: number, actorUserId: number) => Promise<unknown>;
    rejectPayment: (
      phaseId: number,
      actorUserId: number,
      action: 'request_new_proof' | 'reject_dossier',
      reason: string
    ) => Promise<unknown>;
  }
>;

const CODES: Code[] = ['M5', 'M6', 'M7'];
const REASON = "Quittance falsifiée : la référence bancaire n'existe pas.";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('K4 payment decisions (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let svc: Services;
  let closeAppPool: () => Promise<void>;
  let seq = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [m5, m6, m7, dbModule] = await Promise.all([
      import('../deep-evaluation/deep-evaluation.service.js'),
      import('../site-inspection/site-inspection.service.js'),
      import('../certificates/certificates.service.js'),
      import('../../shared/db/index.js'),
    ]);
    svc = { M5: m5, M6: m6, M7: m7 };
    closeAppPool = () => dbModule.db.$client.end();
    await pool.query(
      `CREATE OR REPLACE FUNCTION k4_forced_failure() RETURNS trigger LANGUAGE plpgsql AS
       $$ BEGIN RAISE EXCEPTION 'K4 forced failure'; END $$`
    );
  });

  after(async () => {
    await pool.query('DROP FUNCTION IF EXISTS k4_forced_failure() CASCADE');
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  /** A dossier in progress with one phase whose proof awaits the S5 decision. */
  async function seed(phaseCode: Code, paymentStatus = 'pending_validation') {
    const n = `${Date.now().toString(36)}${++seq}`; // short: employee_code is varchar(20)
    const user = await one(
      `INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent S5 K4', $2) RETURNING id`,
      [`K4-${n}`, `k4-${n}@test.local`]
    );
    const org = await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`ORG K4 ${n}`]
    );
    const applicant = await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant K4', $2, 'x') RETURNING id`,
      [org.id, `postulant-${n}@test.local`]
    );
    const request = await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', 'in_progress') RETURNING id`,
      [`DEM-K4-${n}`, applicant.id, org.id]
    );
    const phase = await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [
      request.id,
      phaseCode,
    ]);
    const payment = await one(
      `INSERT INTO payments (phase_id, status, invoice_file_url, proof_file_url) VALUES ($1, $2, 'inv', 'proof') RETURNING id`,
      [phase.id, paymentStatus]
    );
    return { userId: user.id as number, requestId: request.id as number, phaseId: phase.id as number, paymentId: payment.id as number };
  }

  async function state(s: Awaited<ReturnType<typeof seed>>) {
    const payment = await one(
      'SELECT status, rejection_action, rejection_reason, validated_by FROM payments WHERE id = $1',
      [s.paymentId]
    );
    const request = await one('SELECT status, rejection_reason FROM requests WHERE id = $1', [s.requestId]);
    const audits = (
      await pool.query(
        `SELECT action, module FROM audit_logs WHERE entity_id = $1 AND action LIKE 'PAYMENT_%' AND user_id = $2`,
        [s.paymentId, s.userId]
      )
    ).rows;
    const certificates = (await one('SELECT count(*)::int AS n FROM certificates WHERE request_id = $1', [s.requestId])).n;
    return { payment, request, audits, certificates };
  }

  /** Holds the payment row lock on a separate connection. */
  async function holdRowLock(paymentId: number) {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
    return client;
  }

  /** Resolves once another backend waits on a lock while touching payments. */
  async function waitUntilBlockedOnPayments() {
    for (let i = 0; i < 250; i++) {
      const { n } = await one(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%"payments"%'`
      );
      if (n > 0) return;
      await sleep(20);
    }
    throw new Error('the service call never waited on the payment row lock');
  }

  describe('rejection', () => {
    it('request_new_proof: payment back to awaiting_proof, dossier untouched, audited', async () => {
      const s = await seed('M6');
      await svc.M6.rejectPayment(s.phaseId, s.userId, 'request_new_proof', 'Illisible');
      const after = await state(s);
      assert.equal(after.payment.status, 'awaiting_proof');
      assert.equal(after.payment.rejection_action, 'request_new_proof');
      assert.equal(after.payment.rejection_reason, 'Illisible');
      assert.deepEqual(after.request, { status: 'in_progress', rejection_reason: null });
      assert.deepEqual(after.audits, [{ action: 'PAYMENT_REJECTED', module: 'M6' }]);
    });

    for (const code of CODES) {
      it(`${code} reject_dossier: payment and dossier rejected together, shared wording`, async () => {
        const s = await seed(code);
        await svc[code].rejectPayment(s.phaseId, s.userId, 'reject_dossier', REASON);
        const after = await state(s);
        assert.equal(after.payment.status, 'rejected');
        assert.equal(after.payment.rejection_reason, REASON);
        assert.equal(after.request.status, 'rejected');
        assert.equal(after.request.rejection_reason, `Paiement rejeté - dossier annulé : ${REASON}`);
        assert.deepEqual(after.audits, [{ action: 'PAYMENT_REJECTED', module: code }]);
      });
    }

    it('atomic: if the dossier update fails, the payment and the audit are not written', async () => {
      const s = await seed('M6');
      const trigger = `k4_fail_${s.requestId}`;
      await pool.query(
        `CREATE TRIGGER ${trigger} BEFORE UPDATE ON requests FOR EACH ROW
         WHEN (NEW.id = ${s.requestId}) EXECUTE FUNCTION k4_forced_failure()`
      );
      try {
        // Drizzle wraps the PostgreSQL error ("Failed query"); the cause is ours.
        await assert.rejects(svc.M6.rejectPayment(s.phaseId, s.userId, 'reject_dossier', REASON), (error: Error) =>
          /K4 forced failure/.test(String((error.cause as Error | undefined)?.message ?? error.message))
        );
      } finally {
        await pool.query(`DROP TRIGGER ${trigger} ON requests`);
      }
      const after = await state(s);
      assert.deepEqual(after.payment, {
        status: 'pending_validation',
        rejection_action: null,
        rejection_reason: null,
        validated_by: null,
      });
      assert.equal(after.request.status, 'in_progress');
      assert.deepEqual(after.audits, []);
    });

    it("an endpoint cannot reject another module's payment", async () => {
      const s = await seed('M5');
      await assert.rejects(svc.M6.rejectPayment(s.phaseId, s.userId, 'reject_dossier', REASON), /PAYMENT_NOT_FOUND/);
      const after = await state(s);
      assert.equal(after.payment.status, 'pending_validation');
      assert.equal(after.request.status, 'in_progress');
    });

    it('a payment that is not awaiting a decision cannot be rejected', async () => {
      const s = await seed('M6', 'awaiting_proof');
      await assert.rejects(svc.M6.rejectPayment(s.phaseId, s.userId, 'reject_dossier', REASON), /PAYMENT_NOT_PENDING/);
      const after = await state(s);
      assert.equal(after.payment.status, 'awaiting_proof');
      assert.equal(after.request.status, 'in_progress');
      assert.deepEqual(after.audits, []);
    });
  });

  describe('concurrent decisions on the same proof', () => {
    for (const code of CODES) {
      it(`${code}: a validation that started before a rejection committed does not overwrite it`, async () => {
        const s = await seed(code);
        const lock = await holdRowLock(s.paymentId);
        const validation = svc[code].validatePayment(s.phaseId, s.userId).then(
          () => 'validated',
          (error: Error) => error.message
        );
        try {
          await waitUntilBlockedOnPayments();
          // The competing decision commits first.
          await lock.query(
            `UPDATE payments SET status = 'rejected', rejection_action = 'reject_dossier', rejection_reason = 'x' WHERE id = $1`,
            [s.paymentId]
          );
          await lock.query('COMMIT');
        } finally {
          lock.release();
        }
        assert.equal(await validation, 'PAYMENT_NOT_PENDING');
        const after = await state(s);
        assert.equal(after.payment.status, 'rejected');
        assert.equal(after.payment.validated_by, null);
        assert.equal(after.certificates, 0, 'no certificate for a rejected payment');
        assert.deepEqual(after.audits, []);
      });
    }

    it('a rejection that started before a validation committed does not overwrite it', async () => {
      const s = await seed('M6');
      const lock = await holdRowLock(s.paymentId);
      const rejection = svc.M6.rejectPayment(s.phaseId, s.userId, 'reject_dossier', REASON).then(
        () => 'rejected',
        (error: Error) => error.message
      );
      try {
        await waitUntilBlockedOnPayments();
        await lock.query(`UPDATE payments SET status = 'validated' WHERE id = $1`, [s.paymentId]);
        await lock.query('COMMIT');
      } finally {
        lock.release();
      }
      assert.equal(await rejection, 'PAYMENT_NOT_PENDING');
      const after = await state(s);
      assert.equal(after.payment.status, 'validated');
      assert.equal(after.request.status, 'in_progress', 'a validated payment never cancels the dossier');
      assert.deepEqual(after.audits, []);
    });

    it('validation and final rejection fired together: exactly one wins, state stays consistent', async () => {
      for (let round = 0; round < 10; round++) {
        const s = await seed('M6');
        const outcomes = await Promise.allSettled([
          svc.M6.validatePayment(s.phaseId, s.userId),
          svc.M6.rejectPayment(s.phaseId, s.userId, 'reject_dossier', REASON),
        ]);
        const won = outcomes.filter((o) => o.status === 'fulfilled').length;
        assert.equal(won, 1, `round ${round}: ${JSON.stringify(outcomes.map((o) => o.status))}`);
        const lost = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
        assert.match(lost.reason.message, /PAYMENT_NOT_PENDING/);
        const after = await state(s);
        if (after.payment.status === 'validated') {
          assert.equal(after.request.status, 'in_progress');
          assert.deepEqual(after.audits, [{ action: 'PAYMENT_VALIDATED', module: 'M6' }]);
        } else {
          assert.equal(after.payment.status, 'rejected');
          assert.equal(after.request.status, 'rejected');
          assert.deepEqual(after.audits, [{ action: 'PAYMENT_REJECTED', module: 'M6' }]);
        }
      }
    });
  });
});
