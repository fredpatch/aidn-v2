/** STORAGE-0A - rewrites stored /uploads/<key> addresses to stable
 *  /api/files/<id> addresses: `npm run storage:rewrite-addresses`.
 *
 *    (no flag)            dry run: prints the plan, changes nothing
 *    --apply              applies the plan in one transaction
 *    --accept-conflicts   lets --apply proceed while conflicts remain
 *                         (conflicting rows are left unchanged either way)
 *
 *  Run with the API stopped (no orphan cleanup, uploads or workflow writes
 *  may race it). Outside local development, --apply requires
 *  STORAGE_BACKUP_CONFIRMED=<backup id> (verified DB + uploads backup).
 *  Locally, the planned changes are saved to .storage-rewrite/ first. */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from '../shared/db/index.js';
import {
  applyAddressRewrite,
  diskFileInfo,
  loadAddressRows,
  loadExistingAssets,
  planAddressRewrite,
  type AddressRewritePlan,
} from '../modules/files/address-rewrite.js';
import { isLocalEnvironment } from '../modules/files/file-grant.js';

/** Different from the seeding lock: only one rewrite at a time. */
const REWRITE_LOCK_ID = 4_203_117_002;

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const acceptConflicts = args.has('--accept-conflicts');

function report(plan: AddressRewritePlan, mode: string): number {
  const changes = plan.registrations.length + plan.links.length + plan.rewrites.length;
  console.log(`[storage] Address rewrite - ${mode}`);
  const byColumn = new Map<string, number>();
  for (const rewrite of plan.rewrites) {
    const key = `${rewrite.table}.${rewrite.column}`;
    byColumn.set(key, (byColumn.get(key) ?? 0) + 1);
  }
  for (const [column, count] of byColumn) console.log(`  ${column}: ${count} address(es) to rewrite`);
  const missing = plan.registrations.filter((r) => !r.fileExists).length;
  console.log(`  Assets to register: ${plan.registrations.length} (${missing} with a missing file, kept missing)`);
  console.log(`  Assets to link (referenced but unlinked): ${plan.links.length}`);
  console.log(`  Conflicts (blockers, rows left unchanged): ${plan.conflicts.length}`);
  for (const c of plan.conflicts) {
    console.log(`    - ${c.table}.${c.column}#${c.rowId}: asset ${c.assetId ?? '(new)'} belongs to ${c.actualOwner}, row implies ${c.expectedOwner}`);
  }
  console.log(`  Skipped values (not /uploads/, left unchanged): ${plan.skipped.length}`);
  for (const s of plan.skipped) console.log(`    - ${s.table}.${s.column}#${s.rowId}: ${s.value.slice(0, 120)}`);
  console.log(`  Total changes: ${changes}`);
  return changes;
}

function saveLocalSafeguard(plan: AddressRewritePlan): string {
  const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const dir = path.join(apiRoot, '.storage-rewrite');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rewrite-${new Date().toISOString().replace(/[:.]/g, '')}.json`);
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

async function main(): Promise<number> {
  if (!apply) {
    const plan = planAddressRewrite(await loadAddressRows(db), await loadExistingAssets(db), diskFileInfo);
    report(plan, 'DRY RUN (nothing changed)');
    if (plan.conflicts.length > 0) {
      console.log('[storage] Blockers found: resolve the conflicts above before --apply.');
      return 2;
    }
    return 0;
  }

  if (!isLocalEnvironment() && !process.env.STORAGE_BACKUP_CONFIRMED) {
    console.error('[storage] Refusing --apply: set STORAGE_BACKUP_CONFIRMED=<backup id> after a verified DB + uploads backup.');
    return 3;
  }

  return db.transaction(async (tx) => {
    const [lock] = (await tx.execute(sql`SELECT pg_try_advisory_xact_lock(${REWRITE_LOCK_ID}) AS ok`)).rows as Array<{ ok: boolean }>;
    if (!lock?.ok) {
      console.error('[storage] Another address rewrite is running.');
      return 4;
    }
    // Planned inside the transaction, so it reflects exactly what is applied.
    const plan = planAddressRewrite(await loadAddressRows(tx), await loadExistingAssets(tx), diskFileInfo);
    report(plan, 'APPLY');
    if (plan.conflicts.length > 0 && !acceptConflicts) {
      console.error('[storage] Refusing --apply while conflicts remain (use --accept-conflicts to leave those rows unchanged).');
      return 2;
    }
    if (isLocalEnvironment()) console.log(`[storage] Local safeguard written: ${saveLocalSafeguard(plan)}`);
    else console.log(`[storage] Backup confirmed: ${process.env.STORAGE_BACKUP_CONFIRMED}`);
    await applyAddressRewrite(tx, plan);
    console.log('[storage] Applied.');
    return 0;
  });
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[storage] Failed (nothing applied):', error instanceof Error ? error.message : error);
    process.exit(1);
  });
