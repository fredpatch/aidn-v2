/** STORAGE-3A - relocates a linked document_template upload off the staging
 *  area to its canonical reference location, synchronously, right after the
 *  template attachment transaction has committed. Mirrors
 *  relocateDossierAssetAfterCommit's crash-safety contract exactly (target-
 *  first idempotency via relocateFile, never throws, self-healing on retry),
 *  but templates have no dossier StorageContext - there is no request
 *  reference or phase to resolve, just the template key the caller already
 *  has in hand - so this does not go through storage-context.ts at all. */
import { and, eq } from 'drizzle-orm';
import type { DocumentTemplateKey } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { relocateFile, type RelocatableAsset, type RelocationOutcome } from './relocate-asset.js';

/** Pure - the canonical reference storage key, reusing the staging key's
 *  UUID filename (and extension) unchanged. Never re-randomizes on move. */
export function computeReferenceTemplateStorageKey(
  templateKey: DocumentTemplateKey,
  stagingStorageKey: string
): string {
  const filename = stagingStorageKey.split('/').pop();
  if (!filename) throw new Error('STORAGE_KEY_INVALID');
  return ['reference', 'document-templates', templateKey, filename].join('/');
}

export interface RelocateReferenceAssetAfterCommitDeps {
  /** Reads storage_key + uploadedFromApp fresh - never trusts anything
   *  computed earlier. */
  loadAsset: (assetId: number) => Promise<RelocatableAsset | undefined>;
  /** Conditional update (id + expected old key); false = someone else moved
   *  it first (lost the race harmlessly). */
  casStorageKey: (assetId: number, expectedOldKey: string, newKey: string) => Promise<boolean>;
  root: string;
}

const defaultDeps: RelocateReferenceAssetAfterCommitDeps = {
  loadAsset: async (assetId) => {
    const [row] = await db
      .select({ storageKey: uploadAssets.storageKey, uploadedFromApp: uploadAssets.uploadedFromApp })
      .from(uploadAssets)
      .where(eq(uploadAssets.id, assetId));
    return row;
  },
  casStorageKey: async (assetId, expectedOldKey, newKey) => {
    const updated = await db
      .update(uploadAssets)
      .set({ storageKey: newKey })
      .where(and(eq(uploadAssets.id, assetId), eq(uploadAssets.storageKey, expectedOldKey)))
      .returning({ id: uploadAssets.id });
    return updated.length === 1;
  },
  root: UPLOADS_ROOT,
};

/** The orchestrator document-templates.service.ts invokes, unconditionally,
 *  right after upsertTemplate's transaction commits (both the fresh-attach
 *  and the 'attached_here' retry outcomes) and the repair CLI invokes for a
 *  stuck linked-but-staging template. Never throws. */
export async function relocateReferenceAssetAfterCommit(
  assetId: number,
  templateKey: DocumentTemplateKey,
  deps: RelocateReferenceAssetAfterCommitDeps = defaultDeps
): Promise<RelocationOutcome> {
  try {
    const asset = await deps.loadAsset(assetId);
    if (!asset) return { status: 'error', assetId, error: 'ASSET_NOT_FOUND' };
    const { storageKey } = asset;

    // Defense-in-depth (STORAGE-3): a seeded template writes directly to its
    // canonical path and is never staged, so it must never be routed through
    // this relocation path either, even by a caller's mistake.
    if (asset.uploadedFromApp === 'api') {
      return { status: 'skipped_server_generated', assetId, fromKey: storageKey };
    }

    // Sole eligibility gate (same STORAGE-1/2 rule: no legacy backfill) -
    // this is also what leaves a true-legacy, non-staging template path
    // (e.g. a pre-STORAGE-3 seeded file) untouched until STORAGE-4.
    if (!storageKey.startsWith('staging/')) {
      return { status: 'skipped_not_staging', assetId, fromKey: storageKey };
    }

    const toKey = computeReferenceTemplateStorageKey(templateKey, storageKey);
    const moveStatus = await relocateFile(deps.root, storageKey, toKey);

    // Optimistic, conditioned on the exact key we just read/moved from - a
    // concurrent relocation (e.g. a parallel repair-CLI run) loses gracefully
    // rather than corrupting the row.
    const updated = await deps.casStorageKey(assetId, storageKey, toKey);
    if (!updated) return { status: 'skipped_stale', assetId, fromKey: storageKey, toKey };

    return { status: moveStatus, assetId, fromKey: storageKey, toKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[relocate-reference-asset] relocation failed (business action already committed, unaffected)', {
      assetId,
      templateKey,
      error: message,
    });
    return { status: 'error', assetId, error: message };
  }
}
