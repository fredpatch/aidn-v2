/** MIGRATION-INTEGRITY-CI - verifies `drizzle-kit generate` can read the
 *  committed snapshot graph and that schema.ts has no pending drift, without
 *  ever touching the real checked-in apps/api/drizzle/ folder. Catches a
 *  broken/colliding snapshot graph (drizzle-kit generate itself fails) and a
 *  schema.ts change with no committed migration (generate produces a new
 *  SQL file). The invariant is "generate succeeds AND creates no new
 *  migration SQL" - never the console wording, which isn't part of
 *  drizzle-kit's contract.
 *
 *  Needs a reachable Postgres (drizzle-kit generate's postgresql dialect
 *  connects to read extension/search_path info); point DATABASE_URL at any
 *  disposable database - it is only ever read, never migrated or seeded.
 *
 *  Run: npx tsx src/scripts/check-migrations-replayable.ts
 *  (or `npm run db:check:replayable`) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

function run(): void {
  const apiRoot = process.cwd();
  const realDrizzleDir = path.join(apiRoot, 'drizzle');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-migrations-replayable-'));
  const tempOut = path.join(tempRoot, 'out');
  // drizzle-kit resolves `out` (and `schema`) relative to the config file's
  // own cwd at run time, not as an absolute path - an absolute `out` gets
  // re-joined onto cwd instead of used as-is. Both paths are therefore
  // expressed relative to apiRoot (where the config file lives and where
  // the process below runs), the same way the real drizzle.config.ts does.
  const outRelative = path.relative(apiRoot, tempOut).split(path.sep).join('/');
  const tempConfig = path.join(apiRoot, `.ci-check-replayable-${path.basename(tempRoot)}.config.ts`);

  try {
    fs.cpSync(realDrizzleDir, tempOut, { recursive: true });
    const sqlCountBefore = fs.readdirSync(tempOut).filter((name) => name.endsWith('.sql')).length;

    const configContent = `import type { Config } from 'drizzle-kit';
export default {
  schema: './src/shared/db/schema.ts',
  out: '${outRelative}',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL as string },
  verbose: true,
  strict: false,
} satisfies Config;
`;
    fs.writeFileSync(tempConfig, configContent);

    // Runs from apiRoot so drizzle-kit resolves schema.ts's own imports
    // (drizzle-orm etc.) through apps/api's node_modules, and so `npx`
    // finds the pinned drizzle-kit this workspace already hoists to the
    // repo root's node_modules/.bin (the same binary `npm run db:generate`
    // itself uses) instead of reaching out to the registry.
    execSync(`npx drizzle-kit generate --config "${path.basename(tempConfig)}"`, {
      cwd: apiRoot,
      stdio: 'inherit',
      env: process.env,
    });

    const sqlCountAfter = fs.readdirSync(tempOut).filter((name) => name.endsWith('.sql')).length;

    console.log(`\nMigration SQL files before generate: ${sqlCountBefore}`);
    console.log(`Migration SQL files after generate:  ${sqlCountAfter}`);

    if (sqlCountAfter !== sqlCountBefore) {
      console.error(
        '\nMigration replayability check FAILED: drizzle-kit generate created a new migration. ' +
          'schema.ts has changed without a committed migration, or the snapshot graph no longer ' +
          'matches the committed SQL. Run `npm run db:generate` locally, review the SQL, and commit it.'
      );
      process.exitCode = 1;
      return;
    }

    console.log('\nOK: drizzle-kit generate succeeded and created no new migration.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempConfig, { force: true });
  }
}

run();
