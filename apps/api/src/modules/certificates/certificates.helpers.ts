import { like, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '../../shared/db/index.js';
import { certificates } from '../../shared/db/schema.js';

/** Reference format: CERT-YYYY-XXXX, sequential per calendar year across all
 *  certificates (not per-organisation - this is our internal tracking id,
 *  distinct from the "N° de référence de l'agrément" DN enters manually on
 *  the certificate itself). No reset policy needed since XXXX is scoped to
 *  the year already.
 *
 *  K8 - the next number follows the highest CERT-YYYY-n of the year. It
 *  used to be a count of the year's certificates: other references (the
 *  analytics demo seed writes CERT-AN-n) were counted too, and once
 *  certificates were deleted the count fell back onto a number in use - the
 *  unique index then turned the validation into a 500. */
export async function generateCertificateReference(executor: DbExecutor = db): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CERT-${year}-`;

  // K5 - two validations committing at the same time would read the same
  // highest number and collide on the unique reference. Inside a
  // transaction this lock serialises them until commit.
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext('aidn:certificate_reference'))`);

  const [{ highest }] = await executor
    .select({
      highest: sql<number | null>`max(substring(${certificates.reference} from ${`^${prefix}([0-9]+)$`})::int)`,
    })
    .from(certificates)
    .where(like(certificates.reference, `${prefix}%`));

  const sequence = String((highest ?? 0) + 1).padStart(4, '0');
  return `${prefix}${sequence}`;
}
