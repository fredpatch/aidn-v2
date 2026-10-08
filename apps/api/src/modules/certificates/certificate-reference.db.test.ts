/** K8 - the certificate reference follows the highest CERT-YYYY-n of the
 *  year (it was a count: other references and deleted certificates shifted
 *  it onto a number in use). Real PostgreSQL, skipped without DATABASE_URL.
 *
 *  Each case runs in a transaction that is rolled back: its rows are never
 *  visible to the other test files, and the advisory lock taken by
 *  generateCertificateReference serialises it with any concurrent
 *  validation. Sequences 9000+ keep it clear of the references other files
 *  create. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

class Rollback extends Error {}

describe('K8 certificate reference (real PostgreSQL)', { skip }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let generate: typeof import('./certificates.helpers.js').generateCertificateReference;
  const year = new Date().getFullYear();
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    const [dbModule, helpers] = await Promise.all([
      import('../../shared/db/index.js'),
      import('./certificates.helpers.js'),
    ]);
    db = dbModule.db;
    generate = helpers.generateCertificateReference;
  });

  after(async () => {
    await db.$client.end();
  });

  /** Runs `body` with `insert(reference)` in a rolled-back transaction. */
  async function inRolledBackTx(body: (tx: unknown, insert: (ref: string) => Promise<void>) => Promise<void>) {
    await assert.rejects(
      db.transaction(async (tx: { execute: (q: unknown) => Promise<{ rows: Array<{ id: number }> }> }) => {
        const k = `${tag}${n++}`;
        const {
          rows: [org],
        } = await tx.execute(
          sql`INSERT INTO organisations (name, normalized_name, legal_address) VALUES (${`OMA K8 ${k}`}, ${`oma k8 ${k}`}, 'Libreville') RETURNING id`
        );
        const {
          rows: [applicant],
        } = await tx.execute(
          sql`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES (${org.id}, 'P', ${`k8-${k}@t.local`}, 'x') RETURNING id`
        );
        let i = 0;
        const insert = async (reference: string) => {
          const {
            rows: [request],
          } = await tx.execute(
            sql`INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
                VALUES (${`DEM-K8-${k}-${i++}`}, ${applicant.id}, ${org.id}, 'issuance', 'completed') RETURNING id`
          );
          await tx.execute(
            sql`INSERT INTO certificates (request_id, reference, certificate_type) VALUES (${request.id}, ${reference}, 'agreement')`
          );
        };
        await body(tx, insert);
        throw new Rollback();
      }),
      Rollback
    );
  }

  it('next number = highest of the year + 1, gaps kept', async () => {
    await inRolledBackTx(async (tx, insert) => {
      await insert(`CERT-${year}-9000`);
      await insert(`CERT-${year}-9500`);
      assert.equal(await generate(tx as never), `CERT-${year}-9501`);
    });
  });

  it('other references and other years do not move the sequence', async () => {
    await inRolledBackTx(async (tx, insert) => {
      await insert(`CERT-${year}-9100`);
      for (let i = 0; i < 5; i++) await insert(`CERT-AN-${tag}${i}`);
      await insert(`CERT-${year + 1}-9999`);
      await insert(`CERT-${year}-9100-BIS`);
      assert.equal(await generate(tx as never), `CERT-${year}-9101`);
    });
  });

  it('a deleted certificate does not bring back a number in use', async () => {
    await inRolledBackTx(async (tx, insert) => {
      for (const s of ['9200', '9201', '9202']) await insert(`CERT-${year}-${s}`);
      await (tx as { execute: (q: unknown) => Promise<unknown> }).execute(
        sql`DELETE FROM certificates WHERE reference = ${`CERT-${year}-9201`}`
      );
      const next = await generate(tx as never);
      assert.equal(next, `CERT-${year}-9203`);
      await insert(next); // the unique index accepts it
    });
  });
});
