import { eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { documentTemplates, documentVersions } from "../../shared/db/schema.js";
import { logAudit } from "../auth/auth.service.js";
import type { DocumentTemplateKey } from "@aidn/shared";

export interface TemplateView {
  id: number;
  key: string;
  label: string;
  fileUrl: string | null;
  mimeType: string | null;
  uploadedAt: Date | null;
  active: boolean;
}

function toTemplateView(row: typeof documentTemplates.$inferSelect): TemplateView {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    fileUrl: row.fileUrl,
    mimeType: row.mimeType,
    uploadedAt: row.uploadedAt,
    active: row.active,
  };
}

export async function listTemplates(): Promise<TemplateView[]> {
  const rows = await db.select().from(documentTemplates);
  return rows.map(toTemplateView);
}

export async function getTemplateByKey(key: DocumentTemplateKey): Promise<TemplateView | null> {
  const [row] = await db.select().from(documentTemplates).where(eq(documentTemplates.key, key));
  return row ? toTemplateView(row) : null;
}

/** Upload or replace the active file for a template key. The previous file
 *  (if any) is trashed via the M8 version/trash pattern, never deleted
 *  outright - same as every other document in the app. */
export async function upsertTemplate(params: {
  key: DocumentTemplateKey;
  label: string;
  fileUrl: string;
  mimeType: string;
  uploadedByUserId: number;
}): Promise<TemplateView> {
  const [existing] = await db.select().from(documentTemplates).where(eq(documentTemplates.key, params.key));

  let row: typeof documentTemplates.$inferSelect;

  if (existing) {
    // Trash the previous version before pointing at the new one.
    await db
      .update(documentVersions)
      .set({ isCurrent: false, trashedAt: new Date() })
      .where(eq(documentVersions.ownerId, existing.id));

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
    ownerType: "document_template",
    ownerId: row.id,
    fileUrl: params.fileUrl,
    mimeType: params.mimeType,
    uploadedBy: params.uploadedByUserId,
    isCurrent: true,
  });

  await logAudit({
    userId: params.uploadedByUserId,
    action: existing ? "DOCUMENT_TEMPLATE_REPLACED" : "DOCUMENT_TEMPLATE_CREATED",
    module: "M13",
    entityId: row.id,
    details: { key: params.key },
  });

  return toTemplateView(row);
}
