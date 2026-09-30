import fs from 'fs';
import { and, count, eq, inArray, isNull, like, lt, sql } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';
import { getIntegerValue } from '../system-parameters/system-parameters.service.js';
import { logAudit } from '../auth/auth.service.js';
import type { UploadOwnerType } from './uploads.types.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { resolveStoragePath } from '../files/file-delivery.js';
import { RELOCATABLE_OWNER_TYPES_LIST } from './storage-context.js';

/** SU-only maintenance (POST /api/uploads/link): links, or with allowRelink
 *  relinks, an asset - audited. Ordinary workflow code never calls this;
 *  it attaches through upload-attachment.ts (STORAGE-0B). */
export async function linkOrRelinkUploadAsset(params: {
  uploadAssetId: number;
  ownerType: UploadOwnerType;
  ownerId: number;
  expectedFileUrl?: string;
  actorUserId: number;
  allowRelink?: boolean;
}): Promise<void> {
  const [asset] = await db
    .select()
    .from(uploadAssets)
    .where(eq(uploadAssets.id, params.uploadAssetId));

  if (!asset) throw new Error('UPLOAD_ASSET_NOT_FOUND');

  if (params.expectedFileUrl && asset.fileUrl !== params.expectedFileUrl) {
    throw new Error('UPLOAD_ASSET_FILE_MISMATCH');
  }

  const alreadyLinked = !!asset.linkedOwnerType && !!asset.linkedOwnerId;
  if (alreadyLinked) {
    const sameLink =
      asset.linkedOwnerType === params.ownerType && asset.linkedOwnerId === params.ownerId;
    if (sameLink) return;
    if (!params.allowRelink) throw new Error('UPLOAD_ASSET_ALREADY_LINKED');
  }

  await db
    .update(uploadAssets)
    .set({
      linkedOwnerType: params.ownerType,
      linkedOwnerId: params.ownerId,
      linkedAt: new Date(),
      orphanedAt: null,
    })
    .where(eq(uploadAssets.id, params.uploadAssetId));

  await logAudit({
    userId: params.actorUserId,
    action: alreadyLinked ? 'UPLOAD_ASSET_RELINKED' : 'UPLOAD_ASSET_LINKED',
    module: 'M8',
    entityId: params.uploadAssetId,
    details: {
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      allowRelink: !!params.allowRelink,
    },
  });
}

export interface UploadDiagnostics {
  total: number;
  linked: number;
  unlinked: number;
  orphanMarked: number;
  bySource: Array<{ source: string; total: number }>;
  /** STORAGE-2B - linked assets of a relocatable owner type whose relocation
   *  has not yet moved them out of staging/. A synchronous
   *  relocateDossierAssetAfterCommit() failure (fs error, crash) is the only way an
   *  asset ends up here; the repair CLI (STORAGE-2B) finalizes these.
   *  Read-only counts - no automatic repair from diagnostics.
   *
   *  Scoped to RELOCATABLE_OWNER_TYPES_LIST only: document_template/report
   *  are never relocated by design (storage-context.ts), so a linked asset
   *  of one of those types sitting in staging/ forever is expected, correct
   *  steady state - it must never count toward these "something needs
   *  attention" numbers or make system health look unhealthy. */
  linkedButStaging: number;
  linkedButStagingOver24h: number;
  /** STORAGE-3A - document_template now has a real relocation path
   *  (relocateReferenceAssetAfterCommit), so it moved out of the neutral
   *  "excluded from relocation" bucket below into its own attention-worthy
   *  counts, exactly like the dossier-relocatable owner types above. */
  linkedTemplateButStaging: number;
  linkedTemplateButStagingOver24h: number;
  /** Linked assets of a NON-relocatable owner type (report only, since
   *  STORAGE-3A) that happen to still be under staging/ - informational
   *  only, reported separately, and expected to be non-zero/stable rather
   *  than a symptom of anything broken. Generated certificates never appear
   *  here either: they write directly to generated/ and are never staged. */
  linkedStagingExcludedFromRelocation: number;
}

export async function getUploadDiagnostics(): Promise<UploadDiagnostics> {
  const relocatable = inArray(uploadAssets.linkedOwnerType, RELOCATABLE_OWNER_TYPES_LIST as UploadOwnerType[]);
  const isTemplate = eq(uploadAssets.linkedOwnerType, 'document_template');
  // STORAGE-3A - document_template now relocates too; report is the only
  // owner type left that is never staged-then-relocated by design.
  const excludedFromRelocation = eq(uploadAssets.linkedOwnerType, 'report');

  const [totals] = await db
    .select({
      total: count(),
      linked: sql<number>`count(*) filter (where ${uploadAssets.linkedOwnerType} is not null)::int`,
      orphanMarked: sql<number>`count(*) filter (where ${uploadAssets.orphanedAt} is not null)::int`,
      linkedButStaging: sql<number>`count(*) filter (where ${uploadAssets.linkedOwnerType} is not null and ${uploadAssets.storageKey} like 'staging/%' and ${relocatable})::int`,
      linkedButStagingOver24h: sql<number>`count(*) filter (where ${uploadAssets.linkedOwnerType} is not null and ${uploadAssets.storageKey} like 'staging/%' and ${relocatable} and ${uploadAssets.linkedAt} < now() - interval '24 hours')::int`,
      linkedTemplateButStaging: sql<number>`count(*) filter (where ${uploadAssets.storageKey} like 'staging/%' and ${isTemplate})::int`,
      linkedTemplateButStagingOver24h: sql<number>`count(*) filter (where ${uploadAssets.storageKey} like 'staging/%' and ${isTemplate} and ${uploadAssets.linkedAt} < now() - interval '24 hours')::int`,
      linkedStagingExcludedFromRelocation: sql<number>`count(*) filter (where ${uploadAssets.linkedOwnerType} is not null and ${uploadAssets.storageKey} like 'staging/%' and ${excludedFromRelocation})::int`,
    })
    .from(uploadAssets);

  const bySourceRows = await db
    .select({
      source: uploadAssets.uploadedFromApp,
      total: count(),
    })
    .from(uploadAssets)
    .groupBy(uploadAssets.uploadedFromApp);

  const total = totals?.total ?? 0;
  const linked = totals?.linked ?? 0;
  const orphanMarked = totals?.orphanMarked ?? 0;

  return {
    total,
    linked,
    unlinked: Math.max(0, total - linked),
    orphanMarked,
    bySource: bySourceRows.map((r) => ({ source: r.source, total: r.total })),
    linkedButStaging: totals?.linkedButStaging ?? 0,
    linkedButStagingOver24h: totals?.linkedButStagingOver24h ?? 0,
    linkedTemplateButStaging: totals?.linkedTemplateButStaging ?? 0,
    linkedTemplateButStagingOver24h: totals?.linkedTemplateButStagingOver24h ?? 0,
    linkedStagingExcludedFromRelocation: totals?.linkedStagingExcludedFromRelocation ?? 0,
  };
}

export async function cleanupStaleOrphanUploads(params: {
  actorUserId?: number;
  retentionDays?: number;
}): Promise<{ retentionDays: number; marked: number; deleted: number; skipped: number }> {
  const retentionDays =
    params.retentionDays ?? (await getIntegerValue('upload_orphan_retention_days', 14));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  // STORAGE-1A/STORAGE-2A amendment - automatic physical deletion is scoped
  // to the staging area only. Files under dossiers/, reference/ or generated/
  // are never candidates here even if their DB linkage looks inconsistent -
  // that is a diagnostics/repair-CLI concern (STORAGE-2B), not an
  // automatic-deletion one. Today this LIKE clause is a no-op filter (an
  // unlinked row is never dossier-pathed in practice), but it guards the
  // future case where relocation ran without the link surviving.
  const stale = and(
    isNull(uploadAssets.linkedOwnerType),
    isNull(uploadAssets.linkedOwnerId),
    like(uploadAssets.storageKey, 'staging/%'),
    lt(uploadAssets.createdAt, cutoff)
  );
  const candidates = await db.select({ id: uploadAssets.id }).from(uploadAssets).where(stale);

  let marked = 0;
  let deleted = 0;
  let skipped = 0;

  for (const { id } of candidates) {
    // STORAGE-0B - claim the asset under a row lock before touching its
    // file. An asset an attachment transaction is holding is skipped (SKIP
    // LOCKED); one linked since the candidate query no longer matches.
    const claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ storageKey: uploadAssets.storageKey, orphanedAt: uploadAssets.orphanedAt })
        .from(uploadAssets)
        .where(and(eq(uploadAssets.id, id), stale))
        .for('update', { skipLocked: true });
      if (!row) return null;
      if (!row.orphanedAt) {
        await tx.update(uploadAssets).set({ orphanedAt: new Date() }).where(eq(uploadAssets.id, id));
      }
      return { storageKey: row.storageKey, newlyMarked: !row.orphanedAt };
    });

    if (!claimed) {
      skipped += 1;
      continue;
    }
    if (claimed.newlyMarked) marked += 1;

    // The mark is committed and attachment refuses orphan-marked assets, so
    // no attachment can take this file from here on.
    const fullPath = resolveStoragePath(UPLOADS_ROOT, claimed.storageKey);
    if (fullPath && fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      deleted += 1;
    }
  }

  if (params.actorUserId) {
    await logAudit({
      userId: params.actorUserId,
      action: 'UPLOAD_ORPHANS_CLEANUP',
      module: 'M8',
      details: { retentionDays, marked, deleted, skipped },
    });
  }

  return { retentionDays, marked, deleted, skipped };
}
