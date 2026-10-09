/** K8b - read-only pre-check for migration 0004 (one certificate per
 *  request, unique index certificates_request_id_idx). Never writes to the
 *  database.
 *
 *  Lists every request with more than one certificate. An empty report means
 *  the migration can run; otherwise the duplicates must be resolved by hand
 *  first (which certificate to keep is a business decision), or db:migrate
 *  fails and rolls back.
 *
 *  `--check` exits non-zero when anything is found (same convention as
 *  db-status.ts), so it can gate a deployment.
 *
 *  Run: npx tsx src/scripts/check-certificate-duplicates.ts [--check]
 *   or: npm run db:check:certificates -- --check */
import 'dotenv/config';
import { Pool } from 'pg';
import { findCertificateDuplicates } from '../modules/certificates/certificate-duplicates.js';

async function run(): Promise<void> {
  const check = process.argv.includes('--check');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const rows = await findCertificateDuplicates(pool);
    if (rows.length === 0) {
      console.log('OK - every request has at most one certificate.');
      return;
    }
    console.log(`${rows.length} request(s) with more than one certificate - resolve before migrating:`);
    console.table(rows);
    if (check) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
