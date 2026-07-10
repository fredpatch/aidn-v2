import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';

export async function linkUploadAssetToOwner(params: {
  uploadAssetId?: number;
  ownerType:
    | 'dg_circuit_document'
    | 'formal_request_document'
    | 'preliminary_evaluation_form'
    | 'payment_invoice'
    | 'payment_proof'
    | 'document_template'
    | 'meeting_report'
    | 'phase_closure_document';
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
