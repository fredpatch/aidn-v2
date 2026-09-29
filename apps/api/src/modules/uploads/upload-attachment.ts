/** STORAGE-0B - the only way ordinary workflow code attaches a browser
 *  upload to a business record. The client sends an uploadAssetId; the
 *  server loads the asset, checks the actor uploaded it, and derives the
 *  address, MIME type and uploader from upload_assets - never from the
 *  request body.
 *
 *  Two steps:
 *    1. prepareUploadAttachment - outside any transaction: ownership rules
 *       (pure, assertAttachable) and the file stat.
 *    2. inside the business transaction, after locking the target row:
 *       claimUploadAsset / lockUploadAsset (asset row FOR UPDATE, rules
 *       re-checked), the business writes, then linkLockedAsset.
 *  Lock order is always target row first, asset row second. Generated files
 *  (certificates, reports, seeded templates) never come through here.
 *  linkOrRelinkUploadAsset (SU) stays the only relink path. */
import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { db, type DbTx } from '../../shared/db/index.js';
import { documentVersions, uploadAssets } from '../../shared/db/schema.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { storedFileExistsIn } from '../files/stored-file.js';
import type { UploadOwnerType } from './uploads.types.js';

export type AttachActor = { kind: 'staff'; userId: number } | { kind: 'applicant'; applicantId: number };

export interface AttachTarget {
  ownerType: UploadOwnerType;
  ownerId: number;
}

export interface AttachableAsset {
  id: number;
  fileUrl: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: number | null;
  uploadedByApplicantId: number | null;
  uploadedFromApp: string;
  linkedOwnerType: string | null;
  linkedOwnerId: number | null;
  orphanedAt: Date | null;
}

/** What the server derives from the asset, carried into the transaction. */
export interface PreparedAttachment {
  assetId: number;
  fileUrl: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  uploadedByUserId: number | null;
  actor: AttachActor;
}

export interface AttachOptions {
  /** MIME types this owner accepts; omitted = every accepted upload type. */
  acceptedMimeTypes?: readonly string[];
}

// ── Request parsing ─────────────────────────────────────────────────────────

function toPositiveId(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('UPLOAD_ASSET_ID_INVALID');
  return parsed;
}

/** A required attachment: absent -> UPLOAD_ASSET_REQUIRED. */
export function parseUploadAssetId(value: unknown): number {
  if (value === undefined || value === null || value === '') throw new Error('UPLOAD_ASSET_REQUIRED');
  return toPositiveId(value);
}

/** An optional attachment (closure documents): absent -> undefined. */
export function parseOptionalUploadAssetId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return toPositiveId(value);
}

/** authenticateEither / authenticate set exactly one of the two. */
export function actorFromRequest(req: Request): AttachActor {
  if (req.applicant) return { kind: 'applicant', applicantId: req.applicant.applicantId };
  if (req.user) return { kind: 'staff', userId: req.user.userId };
  throw new Error('UPLOAD_ASSET_NOT_OWNED');
}

// ── Rules (pure) ────────────────────────────────────────────────────────────

/** Ownership is checked before anything that would reveal the asset's
 *  state, so a refused actor only ever learns "unavailable". */
export function assertAttachable(
  asset: AttachableAsset | undefined,
  actor: AttachActor,
  options: AttachOptions = {}
): asserts asset is AttachableAsset {
  if (!asset) throw new Error('UPLOAD_ASSET_NOT_FOUND');
  if (asset.uploadedFromApp === 'api') throw new Error('UPLOAD_ASSET_INVALID_SOURCE');

  const uploader = actor.kind === 'applicant' ? asset.uploadedByApplicantId : asset.uploadedByUserId;
  const actorId = actor.kind === 'applicant' ? actor.applicantId : actor.userId;
  if (uploader === null) throw new Error('UPLOAD_ASSET_INVALID_SOURCE');
  if (uploader !== actorId) throw new Error('UPLOAD_ASSET_NOT_OWNED');

  if (asset.orphanedAt) throw new Error('UPLOAD_ASSET_ORPHANED');
  if (options.acceptedMimeTypes && !options.acceptedMimeTypes.includes(asset.mimeType)) {
    throw new Error('UPLOAD_ASSET_INVALID_OWNER');
  }
}

export function linkState(
  asset: Pick<AttachableAsset, 'linkedOwnerType' | 'linkedOwnerId'>,
  target: AttachTarget
): 'unlinked' | 'here' | 'elsewhere' {
  if (asset.linkedOwnerType === null || asset.linkedOwnerId === null) return 'unlinked';
  return asset.linkedOwnerType === target.ownerType && asset.linkedOwnerId === target.ownerId ? 'here' : 'elsewhere';
}

/** The document_versions row for an attachment - every file field from the
 *  asset. uploaded_by references users, so an applicant upload stores null. */
export function versionValues(prepared: PreparedAttachment, ownerType: UploadOwnerType, ownerId: number) {
  return {
    ownerType,
    ownerId,
    fileUrl: prepared.fileUrl,
    mimeType: prepared.mimeType,
    uploadedBy: prepared.uploadedByUserId,
    isCurrent: true,
  };
}

// ── Database steps ──────────────────────────────────────────────────────────

const assetColumns = {
  id: uploadAssets.id,
  fileUrl: uploadAssets.fileUrl,
  storageKey: uploadAssets.storageKey,
  originalName: uploadAssets.originalName,
  mimeType: uploadAssets.mimeType,
  sizeBytes: uploadAssets.sizeBytes,
  uploadedByUserId: uploadAssets.uploadedByUserId,
  uploadedByApplicantId: uploadAssets.uploadedByApplicantId,
  uploadedFromApp: uploadAssets.uploadedFromApp,
  linkedOwnerType: uploadAssets.linkedOwnerType,
  linkedOwnerId: uploadAssets.linkedOwnerId,
  orphanedAt: uploadAssets.orphanedAt,
};

interface PrepareDeps {
  loadAsset: (id: number) => Promise<AttachableAsset | undefined>;
  fileExists: (storageKey: string) => boolean;
}

const defaultDeps: PrepareDeps = {
  loadAsset: async (id) => {
    const [row] = await db.select(assetColumns).from(uploadAssets).where(eq(uploadAssets.id, id));
    return row;
  },
  fileExists: (storageKey) => storedFileExistsIn(UPLOADS_ROOT, storageKey),
};

/** Step 1, outside the transaction. The link state is not judged here - it
 *  depends on the target and is re-read under lock in step 2. */
export async function prepareUploadAttachment(
  uploadAssetId: number,
  actor: AttachActor,
  options: AttachOptions = {},
  deps: PrepareDeps = defaultDeps
): Promise<PreparedAttachment> {
  const asset = await deps.loadAsset(uploadAssetId);
  assertAttachable(asset, actor, options);
  if (!deps.fileExists(asset.storageKey)) throw new Error('UPLOAD_FILE_MISSING');
  return {
    assetId: asset.id,
    fileUrl: asset.fileUrl,
    mimeType: asset.mimeType,
    originalName: asset.originalName,
    sizeBytes: asset.sizeBytes,
    uploadedByUserId: asset.uploadedByUserId,
    actor,
  };
}

/** Step 2a - locks the asset row (after the target row) and re-checks the
 *  rules, since cleanup may have marked it in between. Returns the owner it
 *  is currently linked to, or null. */
export async function lockUploadAsset(
  tx: DbTx,
  prepared: PreparedAttachment,
  options: AttachOptions = {}
): Promise<AttachTarget | null> {
  const [row] = await tx.select(assetColumns).from(uploadAssets).where(eq(uploadAssets.id, prepared.assetId)).for('update');
  assertAttachable(row, prepared.actor, options);
  if (row.linkedOwnerType === null || row.linkedOwnerId === null) return null;
  return { ownerType: row.linkedOwnerType as UploadOwnerType, ownerId: row.linkedOwnerId };
}

/** Step 2a for an existing target: 'attached_here' means this exact asset is
 *  already attached to it (retry / double click) - the caller returns the
 *  current state without writing anything. Linked elsewhere is refused. */
export async function claimUploadAsset(
  tx: DbTx,
  prepared: PreparedAttachment,
  target: AttachTarget,
  options: AttachOptions = {}
): Promise<'unlinked' | 'attached_here'> {
  const linkedTo = await lockUploadAsset(tx, prepared, options);
  if (!linkedTo) return 'unlinked';
  if (linkState({ linkedOwnerType: linkedTo.ownerType, linkedOwnerId: linkedTo.ownerId }, target) === 'here') {
    return 'attached_here';
  }
  throw new Error('UPLOAD_ASSET_ALREADY_LINKED');
}

/** M8 pattern - the owner's current version(s) go to trash before the new
 *  one is inserted. Always scoped by owner type AND id (ids of different
 *  owner types overlap); versions already trashed keep their date. */
export async function trashCurrentVersions(tx: DbTx, ownerType: UploadOwnerType, ownerId: number): Promise<void> {
  await tx
    .update(documentVersions)
    .set({ isCurrent: false, trashedAt: new Date() })
    .where(
      and(
        eq(documentVersions.ownerType, ownerType),
        eq(documentVersions.ownerId, ownerId),
        isNull(documentVersions.trashedAt)
      )
    );
}

/** Step 2b - the conditional link. Exactly one row must change; otherwise
 *  the transaction rolls back with UPLOAD_ASSET_ALREADY_LINKED. */
export async function linkLockedAsset(tx: DbTx, assetId: number, target: AttachTarget): Promise<void> {
  const linked = await tx
    .update(uploadAssets)
    .set({ linkedOwnerType: target.ownerType, linkedOwnerId: target.ownerId, linkedAt: new Date() })
    .where(and(eq(uploadAssets.id, assetId), isNull(uploadAssets.linkedOwnerType), isNull(uploadAssets.orphanedAt)))
    .returning({ id: uploadAssets.id });
  if (linked.length !== 1) throw new Error('UPLOAD_ASSET_ALREADY_LINKED');
}
