import fs from 'fs';
import { and, count, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';
import { getIntegerValue } from '../system-parameters/system-parameters.service.js';
import { logAudit } from '../auth/auth.service.js';
import type { UploadOwnerType } from './uploads.types.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { resolveStoragePath } from '../files/file-delivery.js';

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
}

export async function getUploadDiagnostics(): Promise<UploadDiagnostics> {
  const [totals] = await db
    .select({
      total: count(),
      linked: sql<number>`count(*) filter (where ${uploadAssets.linkedOwnerType} is not null)::int`,
      orphanMarked: sql<number>`count(*) filter (where ${uploadAssets.orphanedAt} is not null)::int`,
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

  const stale = and(
    isNull(uploadAssets.linkedOwnerType),
    isNull(uploadAssets.linkedOwnerId),
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
