import { and, gte, lt, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '../../shared/db/index.js';
import { certificates } from '../../shared/db/schema.js';

/** Reference format: CERT-YYYY-XXXX, sequential per calendar year across all
 *  certificates (not per-organisation - this is our internal tracking id,
 *  distinct from the "N° de référence de l'agrément" DN enters manually on
 *  the certificate itself). No reset policy needed since XXXX is scoped to
 *  the year already. */
export async function generateCertificateReference(executor: DbExecutor = db): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // K5 - the sequence is a count: two validations committing at the same
  // time would read the same count and collide on the unique reference.
  // Inside a transaction this lock serialises them until commit.
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext('aidn:certificate_reference'))`);

  const [{ total }] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(certificates)
    .where(and(gte(certificates.createdAt, yearStart), lt(certificates.createdAt, yearEnd)));

  const sequence = String((total ?? 0) + 1).padStart(4, '0');
  return `CERT-${year}-${sequence}`;
}
