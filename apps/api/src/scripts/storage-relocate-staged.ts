/** STORAGE-2B - finds every linked-but-staging upload_assets row (storage_key
 *  still starts with staging/ despite being linked to an owner) and finishes
 *  its relocation to the canonical dossier location. Mirrors the dry-run /
 *  --apply pattern of storage-rewrite-addresses.ts.
 *
 *  Correctly handles the critical crash case (STORAGE-2A): if the canonical
 *  target already exists on disk (a prior fs.rename succeeded but the
 *  storage_key DB update never committed), this reconciles the row without
 *  attempting to re-move anything and without reporting the file lost -
 *  relocateAfterCommit's "idempotent by target" check does this for free,
 *  the same code path a self-healing retry through the app would take.
 *
 *    (no flag)   dry run: reports what each candidate would do, changes nothing
 *    --apply     actually relocates every candidate
 *
 *  Safe to run repeatedly and safe to run while the API is up: each asset is
 *  handled independently through the same relocateAfterCommit() every
 *  ordinary attach retry uses, so a concurrent request racing this script
 *  loses the optimistic storage_key update gracefully (skipped_stale) rather
 *  than corrupting anything. */
import 'dotenv/config';
import fs from 'node:fs';
import { isNotNull, and, like, eq } from 'drizzle-orm';
import { db } from '../shared/db/index.js';
import { uploadAssets } from '../shared/db/schema.js';
import { UPLOADS_ROOT } from '../shared/uploads-root.js';
import { resolveStoragePath } from '../modules/files/file-delivery.js';
import { relocateAfterCommit, type RelocationStatus } from '../modules/files/relocate-asset.js';
import { computeDossierStorageKey, isRelocatableOwnerType, resolveStorageContext } from '../modules/uploads/storage-context.js';
import type { UploadOwnerType } from '../modules/uploads/uploads.types.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

interface Candidate {
  id: number;
  storageKey: string;
  linkedOwnerType: UploadOwnerType;
  linkedOwnerId: number;
}

async function loadCandidates(): Promise<Candidate[]> {
  const rows = await db
    .select({
      id: uploadAssets.id,
      storageKey: uploadAssets.storageKey,
      linkedOwnerType: uploadAssets.linkedOwnerType,
      linkedOwnerId: uploadAssets.linkedOwnerId,
    })
    .from(uploadAssets)
    .where(
      and(
        isNotNull(uploadAssets.linkedOwnerType),
        isNotNull(uploadAssets.linkedOwnerId),
        like(uploadAssets.storageKey, 'staging/%')
      )
    );
  return rows
    .filter((r): r is Candidate => r.linkedOwnerType !== null && r.linkedOwnerId !== null)
    .map((r) => ({ id: r.id, storageKey: r.storageKey, linkedOwnerType: r.linkedOwnerType as UploadOwnerType, linkedOwnerId: r.linkedOwnerId! }));
}

type DryRunOutcome =
  | { status: 'would_move'; toKey: string }
  | { status: 'would_reconcile'; toKey: string }
  | { status: 'would_skip_not_relocatable' }
  | { status: 'would_skip_no_context' }
  | { status: 'would_fail_source_missing'; toKey: string };

async function planOne(candidate: Candidate): Promise<DryRunOutcome> {
  if (!isRelocatableOwnerType(candidate.linkedOwnerType)) return { status: 'would_skip_not_relocatable' };
  const context = await resolveStorageContext(candidate.linkedOwnerType, candidate.linkedOwnerId);
  if (!context) return { status: 'would_skip_no_context' };
  const toKey = computeDossierStorageKey(context, candidate.storageKey);
  const destPath = resolveStoragePath(UPLOADS_ROOT, toKey);
  const srcPath = resolveStoragePath(UPLOADS_ROOT, candidate.storageKey);
  if (destPath && fs.existsSync(destPath)) return { status: 'would_reconcile', toKey };
  if (!srcPath || !fs.existsSync(srcPath)) return { status: 'would_fail_source_missing', toKey };
  return { status: 'would_move', toKey };
}

async function dryRun(candidates: Candidate[]): Promise<number> {
  console.log(`[storage-relocate-staged] DRY RUN (nothing changed) - ${candidates.length} linked-but-staging candidate(s)`);
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const plan = await planOne(candidate);
    counts.set(plan.status, (counts.get(plan.status) ?? 0) + 1);
    const detail = 'toKey' in plan ? ` -> ${plan.toKey}` : '';
    console.log(`  asset ${candidate.id} (${candidate.linkedOwnerType}#${candidate.linkedOwnerId}): ${candidate.storageKey}${detail} [${plan.status}]`);
  }
  for (const [status, n] of counts) console.log(`  ${status}: ${n}`);
  return candidates.length;
}

async function apply_(candidates: Candidate[]): Promise<number> {
  console.log(`[storage-relocate-staged] APPLY - ${candidates.length} linked-but-staging candidate(s)`);
  const counts = new Map<RelocationStatus, number>();
  for (const candidate of candidates) {
    const outcome = await relocateAfterCommit(candidate.id, {
      ownerType: candidate.linkedOwnerType,
      ownerId: candidate.linkedOwnerId,
    });
    counts.set(outcome.status, (counts.get(outcome.status) ?? 0) + 1);
    console.log(
      `  asset ${candidate.id} (${candidate.linkedOwnerType}#${candidate.linkedOwnerId}): ${outcome.status}` +
        (outcome.toKey ? ` -> ${outcome.toKey}` : '') +
        (outcome.error ? ` (${outcome.error})` : '')
    );
  }
  for (const [status, n] of counts) console.log(`  ${status}: ${n}`);
  return counts.get('error') ?? 0;
}

async function main(): Promise<number> {
  const candidates = await loadCandidates();
  if (!apply) {
    await dryRun(candidates);
    return 0;
  }
  const errors = await apply_(candidates);
  return errors > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[storage-relocate-staged] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
