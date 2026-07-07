/** Runs migrations by calling drizzle-orm's migrate() directly instead of
 *  the `drizzle-kit migrate` CLI.
 *
 *  Why: drizzle-kit@0.31.10 (our pinned version) has a confirmed upstream
 *  bug where the CLI's migrate command swallows the real SQL/Postgres
 *  error on failure - it just shows a spinner and exits code 1 with no
 *  message at all (see drizzle-team/drizzle-orm#5601, #5816; fixed in the
 *  1.0 beta line but never backported to 0.x). Calling migrate()
 *  programmatically uses the same underlying migrator but actually
 *  surfaces the real error, which is how the enum/schema issues during
 *  Sprint 1 setup were diagnosed.
 *
 *  Run: npx tsx src/scripts/migrate.ts  (or `npm run db:migrate`) */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations applied successfully.');
  } finally {
    await pool.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
