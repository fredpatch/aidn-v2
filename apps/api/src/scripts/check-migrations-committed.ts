/** MIGRATION-INTEGRITY-CI - filesystem-only, DB-independent guard against the
 *  exact drift DEV-DB-MIGRATION-BASELINE found and repaired: SQL files that
 *  exist on disk but aren't referenced by the journal (orphans), journal
 *  entries with no matching SQL file, and duplicate journal tags. Reads
 *  nothing but drizzle/*.sql and drizzle/meta/_journal.json; never touches a
 *  database or mutates any file.
 *
 *  Run: npx tsx src/scripts/check-migrations-committed.ts
 *  (or `npm run db:check:committed`) */
import fs from 'node:fs';
import path from 'node:path';

interface Journal {
  entries: Array<{ tag: string }>;
}

function run(): void {
  const drizzleDir = path.resolve('./drizzle');
  const journalPath = path.join(drizzleDir, 'meta', '_journal.json');

  const journal: Journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const tags = journal.entries.map((entry) => entry.tag);

  const sqlFiles = fs
    .readdirSync(drizzleDir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.slice(0, -'.sql'.length));

  const tagCounts = new Map<string, number>();
  for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  const errors: string[] = [];

  for (const [tag, count] of tagCounts) {
    if (count > 1) errors.push(`Duplicate journal tag "${tag}" (appears ${count} times).`);
  }

  const tagSet = new Set(tags);
  const sqlSet = new Set(sqlFiles);

  for (const file of sqlFiles) {
    if (!tagSet.has(file)) errors.push(`Orphan SQL file "${file}.sql" has no matching journal entry.`);
  }
  for (const tag of tagSet) {
    if (!sqlSet.has(tag)) errors.push(`Journal entry "${tag}" has no matching SQL file ("${tag}.sql").`);
  }

  console.log(`Journal entries: ${tags.length}`);
  console.log(`SQL files: ${sqlFiles.length}`);

  if (errors.length > 0) {
    console.error('\nMigration committed-state check FAILED:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nOK: every SQL file has exactly one journal entry, and vice versa.');
}

run();
