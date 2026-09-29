import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { documentTemplates, documentVersions, users } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  lockUploadAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { storedFilesExist } from '../files/stored-file.js';
import type { DocumentTemplateKey } from '@aidn/shared';

export interface TemplateView {
  id: number;
  key: string;
  label: string;
  fileUrl: string | null;
  fileExists: boolean;
  mimeType: string | null;
  uploadedAt: Date | null;
  active: boolean;
}

function toTemplateView(row: typeof documentTemplates.$inferSelect, fileExists: boolean): TemplateView {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    fileUrl: row.fileUrl,
    fileExists,
    mimeType: row.mimeType,
    uploadedAt: row.uploadedAt,
    active: row.active,
  };
}

export async function listTemplates(): Promise<TemplateView[]> {
  const rows = await db.select().from(documentTemplates);
  const exists = await storedFilesExist(rows.map((row) => row.fileUrl));
  return rows.map((row, index) => toTemplateView(row, exists[index]));
}

export async function getTemplateByKey(key: DocumentTemplateKey): Promise<TemplateView | null> {
  const [row] = await db.select().from(documentTemplates).where(eq(documentTemplates.key, key));
  if (!row) return null;
  const [exists] = await storedFilesExist([row.fileUrl]);
  return toTemplateView(row, exists);
}

export interface TemplateVersionView {
  id: number;
  fileUrl: string;
  fileExists: boolean;
  mimeType: string;
  uploadedAt: Date;
  uploadedByName: string | null;
  isCurrent: boolean;
}

/** Read-only history of every file published for a template key, newest
 *  first. Trashed versions are included - they are kept for traceability. */
export async function listTemplateVersions(key: DocumentTemplateKey): Promise<TemplateVersionView[]> {
  const [template] = await db
    .select({ id: documentTemplates.id })
    .from(documentTemplates)
    .where(eq(documentTemplates.key, key));
  if (!template) return [];

  const rows = await db
    .select({
      id: documentVersions.id,
      fileUrl: documentVersions.fileUrl,
      mimeType: documentVersions.mimeType,
      uploadedAt: documentVersions.uploadedAt,
      uploadedByName: users.fullName,
      isCurrent: documentVersions.isCurrent,
    })
    .from(documentVersions)
    .leftJoin(users, eq(documentVersions.uploadedBy, users.id))
    .where(
      and(
        eq(documentVersions.ownerType, 'document_template'),
        eq(documentVersions.ownerId, template.id)
      )
    )
    .orderBy(desc(documentVersions.uploadedAt), desc(documentVersions.id));

  const exists = await storedFilesExist(rows.map((row) => row.fileUrl));
  return rows.map((row, index) => ({ ...row, fileExists: exists[index] }));
}

/** Upload or replace the active file for a template key. The previous file
 *  (if any) is trashed via the M8 version/trash pattern, never deleted
 *  outright - same as every other document in the app. */
export async function upsertTemplate(params: {
  key: DocumentTemplateKey;
  label: string;
  /** STORAGE-0B - the checked upload; address and type come from it. */
  attachment: PreparedAttachment;
  uploadedByUserId: number;
}): Promise<TemplateView> {
  const { attachment } = params;
  const row = await db.transaction(async (tx) => {
    // Target first: the template row for this key (when it exists).
    const [existing] = await tx
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.key, params.key))
      .for('update');

    if (existing) {
      const target = { ownerType: 'document_template', ownerId: existing.id } as const;
      if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') {
        return existing;
      }
      // Trash the previous version before pointing at the new one.
      await trashCurrentVersions(tx, 'document_template', existing.id);
    } else if (await lockUploadAsset(tx, attachment)) {
      throw new Error('UPLOAD_ASSET_ALREADY_LINKED');
    }

    const values = {
      label: params.label,
      fileUrl: attachment.fileUrl,
      mimeType: attachment.mimeType,
      uploadedBy: params.uploadedByUserId,
      uploadedAt: new Date(),
    };
    const [saved] = existing
      ? await tx.update(documentTemplates).set(values).where(eq(documentTemplates.id, existing.id)).returning()
      : await tx.insert(documentTemplates).values({ key: params.key, ...values }).returning();

    await tx.insert(documentVersions).values(versionValues(attachment, 'document_template', saved.id));
    await linkLockedAsset(tx, attachment.assetId, { ownerType: 'document_template', ownerId: saved.id });

    await logAudit(
      {
        userId: params.uploadedByUserId,
        action: existing ? 'DOCUMENT_TEMPLATE_REPLACED' : 'DOCUMENT_TEMPLATE_CREATED',
        module: 'M13',
        entityId: saved.id,
        details: { key: params.key },
      },
      tx
    );
    return saved;
  });

  const [exists] = await storedFilesExist([row.fileUrl]);
  return toTemplateView(row, exists);
}
