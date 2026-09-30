/** STORAGE-2A - moves a linked upload off the staging area to its canonical
 *  dossier location, synchronously, right after the business transaction
 *  that linked it has committed (approved decision: DB-first, Option B).
 *  A relocation failure here must never surface to the HTTP response and
 *  must never undo the already-committed business action - every entry
 *  point catches and logs.
 *
 *  Eligibility is inferred purely from the storage_key prefix: only a key
 *  starting with "staging/" is ever touched. This is both what makes a
 *  fresh-link and an "attached_here" retry call this unconditionally
 *  (self-healing per the plan) and what guarantees a legacy, pre-slice
 *  storage_key is never moved. */
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { resolveStoragePath } from './file-delivery.js';
import {
  computeDossierStorageKey,
  isRelocatableOwnerType,
  resolveStorageContext,
  type StorageContextDeps,
} from '../uploads/storage-context.js';
import type { UploadOwnerType } from '../uploads/uploads.types.js';

export interface RelocationTarget {
  ownerType: UploadOwnerType;
  ownerId: number;
}

export type RelocationStatus =
  | 'moved' // file physically moved staging -> dossier, storage_key updated
  | 'reconciled' // canonical target already existed (crash case) - storage_key updated only
  | 'skipped_not_staging' // storage_key does not start with staging/ - legacy or already relocated
  | 'skipped_not_relocatable' // owner type excluded (document_template, report, ...)
  | 'skipped_server_generated' // STORAGE-3 defense-in-depth: uploadedFromApp === 'api' (certificates, reports, seeded templates) never enters relocation, even if mistakenly called
  | 'skipped_no_context' // owner row could not be resolved (deleted, bad id)
  | 'skipped_stale' // storage_key changed under us between read and update (concurrent relocation)
  | 'error'; // caught and logged; storage_key left untouched

export interface RelocationOutcome {
  status: RelocationStatus;
  assetId: number;
  fromKey?: string;
  toKey?: string;
  error?: string;
}

/** Move one file from its staging path to its canonical dossier path.
 *
 *  The idempotency check is "by expected target", not "by recorded source":
 *  the canonical target is computed and checked for existence BEFORE the
 *  recorded source is trusted or a missing source is treated as a failure.
 *  This is what recognizes the critical crash case - fs.rename succeeded,
 *  then the storage_key DB update crashed or rolled back before commit, so
 *  storage_key still says staging/... but that source is now gone and the
 *  canonical target already holds the file - as "already relocated, needs
 *  only a storage_key reconciliation", never as a lost file and never as
 *  something to re-move. */
/** Injectable fs primitives - real fs/promises by default. Node's ESM
 *  fs/promises exports cannot be mock.method()'d directly (non-configurable
 *  bindings), so EXDEV / failure simulation in tests goes through this seam
 *  instead of monkey-patching the module. */
export interface FsOps {
  mkdir: (dir: string, opts: { recursive: true }) => Promise<unknown>;
  rename: (from: string, to: string) => Promise<void>;
  copyFile: (from: string, to: string) => Promise<void>;
  unlink: (target: string) => Promise<void>;
  rm: (target: string, opts: { force: true }) => Promise<void>;
  exists: (target: string) => boolean;
}

export const realFsOps: FsOps = {
  mkdir: (dir, opts) => fs.mkdir(dir, opts),
  rename: (from, to) => fs.rename(from, to),
  copyFile: (from, to) => fs.copyFile(from, to),
  unlink: (target) => fs.unlink(target),
  rm: (target, opts) => fs.rm(target, opts),
  exists: (target) => fssync.existsSync(target),
};

export async function relocateFile(
  root: string,
  fromKey: string,
  toKey: string,
  fsOps: FsOps = realFsOps
): Promise<'moved' | 'reconciled'> {
  const destPath = resolveStoragePath(root, toKey);
  const srcPath = resolveStoragePath(root, fromKey);
  if (!destPath || !srcPath) throw new Error('STORAGE_PATH_CONFINEMENT');

  if (fsOps.exists(destPath)) {
    // Already at the canonical location - never re-move, whether or not the
    // recorded source still happens to exist too (e.g. a prior EXDEV
    // fallback whose cleanup unlink failed).
    return 'reconciled';
  }

  if (!fsOps.exists(srcPath)) {
    throw new Error('STORAGE_SOURCE_MISSING');
  }

  await fsOps.mkdir(path.dirname(destPath), { recursive: true });
  try {
    await fsOps.rename(srcPath, destPath);
    return 'moved';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;

    // Cross-device: copy then unlink the source. Clean up a partial
    // destination copy if the copy itself fails.
    try {
      await fsOps.copyFile(srcPath, destPath);
    } catch (copyError) {
      await fsOps.rm(destPath, { force: true }).catch(() => {});
      throw copyError;
    }
    try {
      await fsOps.unlink(srcPath);
    } catch {
      // Best effort - the destination copy is already the source of truth,
      // and the target-existence check in every orchestrator built on this
      // primitive makes a leftover source harmless on any future retry.
    }
    return 'moved';
  }
}

/** Minimal asset facts every relocation orchestrator needs: the source key
 *  to move from, and the source app - the STORAGE-3 defense-in-depth guard
 *  that keeps server-generated files (certificates, reports, seeded
 *  templates, all `uploadedFromApp: 'api'`) out of relocation entirely, even
 *  if a caller mistakenly wired one in. */
export interface RelocatableAsset {
  storageKey: string;
  uploadedFromApp: string;
}

async function loadRelocatableAsset(assetId: number): Promise<RelocatableAsset | undefined> {
  const [row] = await db
    .select({ storageKey: uploadAssets.storageKey, uploadedFromApp: uploadAssets.uploadedFromApp })
    .from(uploadAssets)
    .where(eq(uploadAssets.id, assetId));
  return row;
}

async function casStorageKeyDefault(assetId: number, expectedOldKey: string, newKey: string): Promise<boolean> {
  const updated = await db
    .update(uploadAssets)
    .set({ storageKey: newKey })
    .where(and(eq(uploadAssets.id, assetId), eq(uploadAssets.storageKey, expectedOldKey)))
    .returning({ id: uploadAssets.id });
  return updated.length === 1;
}

export interface RelocateDossierAssetAfterCommitDeps {
  /** Reads storage_key + uploadedFromApp fresh - never trusts anything
   *  computed earlier. */
  loadAsset: (assetId: number) => Promise<RelocatableAsset | undefined>;
  /** Conditional update (id + expected old key); false = someone else moved
   *  it first (lost the race harmlessly). */
  casStorageKey: (assetId: number, expectedOldKey: string, newKey: string) => Promise<boolean>;
  root: string;
  contextDeps?: StorageContextDeps;
}

const defaultDeps: RelocateDossierAssetAfterCommitDeps = {
  loadAsset: loadRelocatableAsset,
  casStorageKey: casStorageKeyDefault,
  root: UPLOADS_ROOT,
};

/** The orchestrator every dossier call site invokes, unconditionally, right
 *  after its business transaction commits (both the fresh-link and the
 *  'attached_here' retry outcomes). Re-reads the asset fresh rather than
 *  trusting anything computed before/during the transaction, since time may
 *  have passed. Never throws. */
export async function relocateDossierAssetAfterCommit(
  assetId: number,
  target: RelocationTarget,
  deps: RelocateDossierAssetAfterCommitDeps = defaultDeps
): Promise<RelocationOutcome> {
  try {
    const asset = await deps.loadAsset(assetId);
    if (!asset) return { status: 'error', assetId, error: 'ASSET_NOT_FOUND' };
    const { storageKey } = asset;

    // Defense-in-depth (STORAGE-3): a server-generated asset must never be
    // routed through dossier relocation, even by a caller's mistake -
    // generated files write directly to their final location and never pass
    // through staging in the first place.
    if (asset.uploadedFromApp === 'api') {
      return { status: 'skipped_server_generated', assetId, fromKey: storageKey };
    }

    // Sole eligibility gate (approved decision: no legacy backfill). This is
    // also what protects legacy pre-slice files on any retry.
    if (!storageKey.startsWith('staging/')) {
      return { status: 'skipped_not_staging', assetId, fromKey: storageKey };
    }

    if (!isRelocatableOwnerType(target.ownerType)) {
      return { status: 'skipped_not_relocatable', assetId, fromKey: storageKey };
    }

    const context = await resolveStorageContext(target.ownerType, target.ownerId, deps.contextDeps);
    if (!context) return { status: 'skipped_no_context', assetId, fromKey: storageKey };

    const toKey = computeDossierStorageKey(context, storageKey);
    const moveStatus = await relocateFile(deps.root, storageKey, toKey);

    // Optimistic, conditioned on the exact key we just read/moved from - a
    // concurrent relocation (e.g. a parallel repair-CLI run) loses gracefully
    // rather than corrupting the row.
    const updated = await deps.casStorageKey(assetId, storageKey, toKey);
    if (!updated) return { status: 'skipped_stale', assetId, fromKey: storageKey, toKey };

    return { status: moveStatus, assetId, fromKey: storageKey, toKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[relocate-asset] relocation failed (business action already committed, unaffected)', {
      assetId,
      target,
      error: message,
    });
    return { status: 'error', assetId, error: message };
  }
}
