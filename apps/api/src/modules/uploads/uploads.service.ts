import fs from 'fs';
import path from 'path';
import { and, count, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';
import { getIntegerValue } from '../system-parameters/system-parameters.service.js';
import { logAudit } from '../auth/auth.service.js';
import type { UploadOwnerType } from './uploads.types.js';

const uploadRootDir = path.resolve(process.cwd(), 'uploads');

export async function linkUploadAssetToOwner(params: {
  uploadAssetId?: number;
  ownerType: UploadOwnerType;
  ownerId: number;
  expectedFileUrl?: string;
}): Promise<void> {
  if (!params.uploadAssetId) return;

  const [asset] = await db
    .select()
    .from(uploadAssets)
    .where(eq(uploadAssets.id, params.uploadAssetId));

  if (!asset) throw new Error('UPLOAD_ASSET_NOT_FOUND');

  if (params.expectedFileUrl && asset.fileUrl !== params.expectedFileUrl) {
    throw new Error('UPLOAD_ASSET_FILE_MISMATCH');
  }

  if (asset.linkedOwnerType && asset.linkedOwnerId) {
    if (asset.linkedOwnerType === params.ownerType && asset.linkedOwnerId === params.ownerId) {
      return;
    }
    throw new Error('UPLOAD_ASSET_ALREADY_LINKED');
  }

  await db
    .update(uploadAssets)
    .set({
      linkedOwnerType: params.ownerType,
      linkedOwnerId: params.ownerId,
      linkedAt: new Date(),
    })
    .where(eq(uploadAssets.id, params.uploadAssetId));
}

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
}): Promise<{ retentionDays: number; marked: number; deleted: number }> {
  const retentionDays =
    params.retentionDays ?? (await getIntegerValue('upload_orphan_retention_days', 14));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const staleRows = await db
    .select()
    .from(uploadAssets)
    .where(
      and(
        isNull(uploadAssets.linkedOwnerType),
        isNull(uploadAssets.linkedOwnerId),
        lt(uploadAssets.createdAt, cutoff)
      )
    );

  let marked = 0;
  let deleted = 0;

  for (const asset of staleRows) {
    if (!asset.orphanedAt) {
      await db
        .update(uploadAssets)
        .set({ orphanedAt: new Date() })
        .where(eq(uploadAssets.id, asset.id));
      marked += 1;
    }

    const relativePath = asset.storageKey.replace(/^\/+/, '');
    const fullPath = path.join(uploadRootDir, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      deleted += 1;
    }
  }

  if (params.actorUserId) {
    await logAudit({
      userId: params.actorUserId,
      action: 'UPLOAD_ORPHANS_CLEANUP',
      module: 'M8',
      details: { retentionDays, marked, deleted },
    });
  }

  return { retentionDays, marked, deleted };
}
