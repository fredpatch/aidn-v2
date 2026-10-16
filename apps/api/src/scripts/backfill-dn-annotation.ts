/** SESSION1-M1-1 - run AFTER `npm run db:migrate` (migration 0008 must have
 *  committed): gives every dossier already past the DG return a Directeur DN
 *  circuit at pending_review. Idempotent - safe to rerun. See
 *  modules/dn-annotation/dn-annotation.backfill.ts for why this is not a
 *  Drizzle migration.
 *
 *  Run: npx tsx src/scripts/backfill-dn-annotation.ts  (or `npm run db:backfill:dn-annotation`) */
import 'dotenv/config';
import { Pool } from 'pg';
import { pgConnectionConfig } from '../shared/db/connection.js';
import { backfillLegacyDnAnnotations } from '../modules/dn-annotation/dn-annotation.backfill.js';

async function run(): Promise<void> {
  const pool = new Pool(pgConnectionConfig());
  try {
    const { eligible, inserted, alreadyPresent } = await backfillLegacyDnAnnotations(pool);
    console.log(
      `Directeur DN backfill: ${eligible} intake circuit(s) past the DG return, ` +
        `${inserted} Directeur DN circuit(s) created, ${alreadyPresent} already present.`
    );
  } finally {
    await pool.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    const code = (error as { code?: string }).code;
    if (code === '22P02') {
      console.error('Backfill failed: run `npm run db:migrate` first (the dn_director_annotation enum value is missing).');
    } else {
      console.error('Backfill failed:', error);
    }
    process.exit(1);
  });
