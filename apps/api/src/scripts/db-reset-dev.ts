/** DEV-DB-MIGRATION-BASELINE - drop/recreate/migrate/seed, guarded to refuse
 *  anything that isn't obviously a local, disposable database. Named
 *  db:reset:dev (never db:reset) on purpose: this script is only ever safe
 *  against a local throwaway, never staging or production.
 *
 *  Guard: the connection host must be loopback (localhost/127.0.0.1/::1) and
 *  the database name must not contain a production/staging-like word.
 *  Loopback-only is a deliberately blunt check - staging and production are
 *  never reachable at "localhost" from a developer's own machine - and it
 *  requires no environment-specific configuration to stay correct. Also
 *  requires an explicit --yes flag, since this process runs non-interactively
 *  and a prompt would either hang or be silently skipped.
 *
 *  Run: npx tsx src/scripts/db-reset-dev.ts --yes  (or `npm run db:reset:dev -- --yes`) */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const DENYLIST_PATTERN = /prod|production|staging|stage/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function assertSafeTarget(databaseUrl: string): { host: string; database: string } {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL.`);
  }

  const host = url.hostname;
  const database = url.pathname.replace(/^\//, '');

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Refusing: DATABASE_URL host "${host}" is not loopback (localhost/127.0.0.1/::1). ` +
        `db:reset:dev only ever operates on a local database.`
    );
  }
  if (DENYLIST_PATTERN.test(database)) {
    throw new Error(
      `Refusing: database name "${database}" looks production/staging-like. ` +
        `Rename it or use a different DATABASE_URL if this is genuinely a local dev database.`
    );
  }
  return { host, database };
}

async function dropAndCreate(databaseUrl: string, database: string): Promise<void> {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${database}"`);
    await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }
}

async function run(): Promise<void> {
  const confirmed = process.argv.includes('--yes');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  const { host, database } = assertSafeTarget(databaseUrl);

  if (!confirmed) {
    console.log(`This will DROP and recreate database "${database}" on ${host}, then migrate and seed it.`);
    console.log('Re-run with --yes to proceed. Nothing has been done.');
    return;
  }

  console.log(`Dropping and recreating "${database}" on ${host}...`);
  await dropAndCreate(databaseUrl, database);

  console.log('Running migrations...');
  execSync('npx tsx src/scripts/migrate.ts', { stdio: 'inherit', env: process.env });

  console.log('Seeding system parameters...');
  execSync('npx tsx src/scripts/seed-system-parameters.ts', { stdio: 'inherit', env: process.env });

  console.log('Seeding reference data...');
  execSync('npx tsx src/scripts/seed-reference-data.ts', { stdio: 'inherit', env: process.env });

  console.log('Done.');
}

run().catch((error) => {
  console.error('db:reset:dev failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
