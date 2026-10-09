/** K8b - one certificate per request, guaranteed by the database (migration
 *  0004, unique index certificates_request_id_idx), plus the read-only
 *  duplicate check run before that migration (real PostgreSQL, skipped
 *  without DATABASE_URL). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('K8b one certificate per request (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [cert, duplicates, dbModule] = await Promise.all([
      import('./certificates.service.js'),
      import('./certificate-duplicates.js'),
      import('../../shared/db/index.js'),
    ]);
    m = { cert, duplicates };
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

  /** An open dossier at M7 with a proof awaiting validation and a certificate. */
  async function dossierWithCertificate(query: Query) {
    const k = `${tag}${++n}`;
    const one = async (sql: string, params: unknown[]) => (await query(sql, params)).rows[0] as { id: number };
    const user = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent K8b', $2) RETURNING id`, [`K8B${k}`, `k8b-${k}@t.local`])).id;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA K8b ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `p8b-${k}@t.local`])).id;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', 'in_progress') RETURNING id`,
      [`DEM-K8B-${k}`, applicant, org]
    )).id;
    const phase = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, 'M7') RETURNING id`, [request])).id;
    await query(`INSERT INTO payments (phase_id, status, invoice_file_url, proof_file_url) VALUES ($1, 'pending_validation', 'i', 'p')`, [phase]);
    await query(`INSERT INTO certificates (request_id, reference, certificate_type) VALUES ($1, $2, 'agreement')`, [request, `CERT-K8B-${k}`]);
    return { k, user, request, phase };
  }

  /** Runs body in a transaction that is always rolled back. */
  async function rolledBack(body: (query: Query) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await body((sql, params) => client.query(sql, params));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('the index refuses a second certificate for the same request', async () => {
    await rolledBack(async (query) => {
      const d = await dossierWithCertificate(query);
      await assert.rejects(
        query(`INSERT INTO certificates (request_id, reference, certificate_type) VALUES ($1, $2, 'agreement')`, [d.request, `CERT-K8B-${d.k}-2`]),
        (error: { code?: string; constraint?: string }) => error.code === '23505' && error.constraint === 'certificates_request_id_idx'
      );
    });
  });

  it('that violation becomes CERTIFICATE_ALREADY_EXISTS; a reference collision stays as it is', async () => {
    let requestDuplicate: unknown;
    let referenceDuplicate: unknown;
    await rolledBack(async (query) => {
      const d = await dossierWithCertificate(query);
      await query('SAVEPOINT s');
      requestDuplicate = await query(`INSERT INTO certificates (request_id, reference, certificate_type) VALUES ($1, $2, 'agreement')`, [d.request, `CERT-K8B-${d.k}-2`]).catch((e) => e);
      await query('ROLLBACK TO SAVEPOINT s');
      // another request with no certificate, reusing d's reference
      const other = await dossierWithCertificate(query);
      await query('DELETE FROM certificates WHERE request_id = $1', [other.request]);
      referenceDuplicate = await query(`INSERT INTO certificates (request_id, reference, certificate_type) VALUES ($1, $2, 'agreement')`, [other.request, `CERT-K8B-${d.k}`]).catch((e) => e);
    });
    assert.throws(() => m.cert.rethrowOneCertificatePerRequest(requestDuplicate), /CERTIFICATE_ALREADY_EXISTS/);
    // wrapped by an ORM (cause chain) - still recognised
    assert.throws(() => m.cert.rethrowOneCertificatePerRequest(new Error('wrapped', { cause: requestDuplicate })), /CERTIFICATE_ALREADY_EXISTS/);
    assert.equal((referenceDuplicate as { constraint?: string }).constraint, 'certificates_reference_unique');
    assert.throws(() => m.cert.rethrowOneCertificatePerRequest(referenceDuplicate), (e) => e === referenceDuplicate);
  });

  it('validating the M7 payment again on a request that has its certificate: 409, nothing written', async () => {
    const d = await dossierWithCertificate((sql, params) => pool.query(sql, params));
    await assert.rejects(m.cert.validatePayment(d.phase, d.user), /CERTIFICATE_ALREADY_EXISTS/);
    const { rows } = await pool.query(
      `SELECT (SELECT status::text FROM payments WHERE phase_id = $1) AS payment, (SELECT count(*)::int FROM certificates WHERE request_id = $2) AS certificates`,
      [d.phase, d.request]
    );
    assert.deepEqual(rows[0], { payment: 'pending_validation', certificates: 1 });
  });

  it('the pre-migration check lists a request holding two certificates (index dropped inside a rolled-back transaction)', async () => {
    await rolledBack(async (query) => {
      const d = await dossierWithCertificate(query);
      await query('DROP INDEX certificates_request_id_idx');
      await query(`INSERT INTO certificates (request_id, reference, certificate_type) VALUES ($1, $2, 'agreement')`, [d.request, `CERT-K8B-${d.k}-2`]);
      const found = await m.duplicates.findCertificateDuplicates({ query: (sql: string) => query(sql) });
      const mine = found.find((row: { request_id: number }) => row.request_id === d.request);
      assert.ok(mine, 'duplicate reported');
      assert.equal(mine.certificate_count, 2);
      assert.deepEqual(mine.certificate_references, [`CERT-K8B-${d.k}`, `CERT-K8B-${d.k}-2`]);
    });
    const { rows } = await pool.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'certificates_request_id_idx'`);
    assert.equal(rows.length, 1, 'index back after the rollback');
  });

  it('db:check:certificates --check: exit 0 and OK when there is no duplicate', async () => {
    const apiRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const { stdout } = await promisify(execFile)('npx', ['tsx', 'src/scripts/check-certificate-duplicates.ts', '--check'], {
      cwd: apiRoot,
      env: process.env,
    });
    assert.match(stdout, /OK - every request has at most one certificate/);
  });
});
