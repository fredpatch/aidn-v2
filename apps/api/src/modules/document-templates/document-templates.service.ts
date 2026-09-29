import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { documentTemplates, documentVersions, users } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { linkUploadAssetToOwner } from '../uploads/uploads.service.js';
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
  fileUrl: string;
  mimeType: string;
  uploadAssetId?: number;
  uploadedByUserId: number;
}): Promise<TemplateView> {
  const [existing] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.key, params.key));

  let row: typeof documentTemplates.$inferSelect;

  if (existing) {
    // Trash the previous version before pointing at the new one.
    await db
      .update(documentVersions)
      .set({ isCurrent: false, trashedAt: new Date() })
      .where(
        and(
          eq(documentVersions.ownerType, 'document_template'),
          eq(documentVersions.ownerId, existing.id)
        )
      );

    [row] = await db
      .update(documentTemplates)
      .set({
        label: params.label,
        fileUrl: params.fileUrl,
        mimeType: params.mimeType,
        uploadedBy: params.uploadedByUserId,
        uploadedAt: new Date(),
      })
      .where(eq(documentTemplates.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(documentTemplates)
      .values({
        key: params.key,
        label: params.label,
        fileUrl: params.fileUrl,
        mimeType: params.mimeType,
        uploadedBy: params.uploadedByUserId,
        uploadedAt: new Date(),
      })
      .returning();
  }

  await db.insert(documentVersions).values({
    ownerType: 'document_template',
    ownerId: row.id,
    fileUrl: params.fileUrl,
    mimeType: params.mimeType,
    uploadedBy: params.uploadedByUserId,
    isCurrent: true,
  });

  await linkUploadAssetToOwner({
    uploadAssetId: params.uploadAssetId,
    ownerType: 'document_template',
    ownerId: row.id,
    expectedFileUrl: params.fileUrl,
  });

  await logAudit({
    userId: params.uploadedByUserId,
    action: existing ? 'DOCUMENT_TEMPLATE_REPLACED' : 'DOCUMENT_TEMPLATE_CREATED',
    module: 'M13',
    entityId: row.id,
    details: { key: params.key },
  });

  const [exists] = await storedFilesExist([row.fileUrl]);
  return toTemplateView(row, exists);
}
