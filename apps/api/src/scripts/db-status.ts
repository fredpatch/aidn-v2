/** DEV-DB-MIGRATION-BASELINE - read-only report of migration state. Never
 *  writes to the database or the repository. Reuses drizzle-orm's own
 *  readMigrationFiles (the exact function migrate() calls internally) for
 *  hashing/ordering, instead of re-implementing a second interpretation of
 *  migration history that could silently drift from the real runner.
 *
 *  Run: npx tsx src/scripts/db-status.ts  (or `npm run db:status`) */
import 'dotenv/config';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Pool } from 'pg';

interface AppliedRow {
  id: number;
  hash: string;
  created_at: string;
}

async function tableExists(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'`
  );
  return rows.length > 0;
}

async function run(): Promise<void> {
  const repoMigrations = readMigrationFiles({ migrationsFolder: './drizzle' });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hasTable = await tableExists(pool);
    const applied: AppliedRow[] = hasTable
      ? (await pool.query('SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows
      : [];
    const appliedHashes = new Set(applied.map((row) => row.hash));
    const repoHashes = new Set(repoMigrations.map((m) => m.hash));

    console.log(`Repository migrations (journal order): ${repoMigrations.length}`);
    for (const migration of repoMigrations) {
      const status = appliedHashes.has(migration.hash) ? 'applied' : 'PENDING';
      console.log(`  [${status.padEnd(7)}] ${migration.hash.slice(0, 12)}...`);
    }

    const pending = repoMigrations.filter((m) => !appliedHashes.has(m.hash));
    const unknown = applied.filter((row) => !repoHashes.has(row.hash));

    console.log(`\nApplied (recorded in DB): ${applied.length}`);
    console.log(`Pending (in repo, not recorded): ${pending.length}`);
    console.log(`Unknown/stale applied hashes (recorded in DB, no matching repo file): ${unknown.length}`);
    if (unknown.length > 0) {
      for (const row of unknown) {
        console.log(`  id=${row.id} hash=${row.hash.slice(0, 12)}... created_at=${row.created_at}`);
      }
    }

    if (!hasTable) {
      console.log('\ndrizzle.__drizzle_migrations does not exist yet - no migrations have ever been applied to this database.');
    }
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('db:status failed:', error);
  process.exit(1);
});
