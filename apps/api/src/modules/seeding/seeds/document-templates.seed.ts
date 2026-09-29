/** Official DN blank forms installed when a template key has never existed.
 *
 *  Rule: startup may create what never existed, but never "corrects" what DN
 *  already owns. If a document_templates row exists for a key - whatever its
 *  label, file, MIME type, active flag or physical-file state - the key is
 *  skipped. No repair, no replacement, no new version. Broken existing
 *  templates are left for the (future) system-health view to report.
 *
 *  Source files are DN-approved copies bundled under
 *  apps/api/seed-assets/document-templates/ (never read from docs/ at runtime).
 *  A seeded template follows the normal upload conventions: the file is copied
 *  into the persistent uploads area, and document_templates, a current
 *  document_versions row and a linked upload_assets row are created. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DocumentTemplateKey } from '@aidn/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../shared/db/schema.js';
import { eq } from 'drizzle-orm';
import { UPLOADS_ROOT } from '../../../shared/uploads-root.js';
import { insertAssetWithAddress } from '../../uploads/asset-registration.js';
import { SeedingError, type SeedItemResult, type SeedResult, type SeedRunContext } from '../seeding.types.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DocumentTemplateSeedDefinition {
  key: DocumentTemplateKey;
  /** Default label, identical to the admin page's default for this key. */
  label: string;
  /** Exact file name under seed-assets/document-templates/. */
  assetFileName: string;
  mimeType: string;
}

/** Explicit key -> approved asset mapping (never inferred from file names). */
export const DOCUMENT_TEMPLATE_SEEDS: readonly DocumentTemplateSeedDefinition[] = [
  {
    key: 'preliminary_evaluation_declaration',
    label: 'Déclaration de pré-évaluation',
    // The pre-evaluation declaration is form F-E-015 in DN numbering.
    assetFileName: 'DN-AIR-R2-3-F-E-015 FORMULAIRE DE DECLARATION DE PRE-EVALUATION.docx',
    mimeType: DOCX_MIME,
  },
  {
    key: 'dn_air_r2_3_f_e_010',
    label: 'DN-AIR-R2-3-F-E-010',
    assetFileName: "DN-AIR-R2-3-F-E-010-FORMULAIRE DE DEMANDE D'AGREMENT RAG 5.3.docx",
    mimeType: DOCX_MIME,
  },
  {
    key: 'dn_air_r2_3_f_e_011',
    label: 'DN-AIR-R2-3-F-E-011',
    assetFileName: 'DN-AIR-R2-3-F-E-011 MATRICE DE CONFORMITE.docx',
    mimeType: DOCX_MIME,
  },
  {
    key: 'dn_air_r2_3_f_e_012',
    label: 'DN-AIR-R2-3-F-E-012',
    assetFileName: 'DN-AIR-R2-3-F-E-012-FDAPM.docx',
    mimeType: DOCX_MIME,
  },
];

// src/ and dist/ share the same layout, so apps/api is four levels up from
// this file in both (same strategy as the uploads router).
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const BUNDLED_TEMPLATE_ASSETS_DIR = path.join(apiRoot, 'seed-assets', 'document-templates');

export interface TemplateSeedPaths {
  assetsDir: string;
  uploadsDir: string;
}

/** A bundled asset copied into the uploads area. */
export interface SeededTemplateFile {
  storageKey: string;
  originalName: string;
  sizeBytes: number;
}

export interface DocumentTemplateRecordStore {
  findExistingKeys(keys: string[]): Promise<Set<string>>;
  /** Creates the template with its current version and linked upload asset.
   *  Returns false (writing nothing) if the key already exists. */
  createTemplate(definition: DocumentTemplateSeedDefinition, file: SeededTemplateFile): Promise<boolean>;
}

const SEED_NAME = 'document-templates';

export async function seedDocumentTemplates(
  records: DocumentTemplateRecordStore,
  options: {
    paths?: TemplateSeedPaths;
    definitions?: readonly DocumentTemplateSeedDefinition[];
    /** Called with the absolute path of every copied file, so the caller can
     *  remove it if the surrounding transaction later rolls back. */
    onFileCreated?: (absolutePath: string) => void;
  } = {}
): Promise<SeedResult> {
  const paths = options.paths ?? { assetsDir: BUNDLED_TEMPLATE_ASSETS_DIR, uploadsDir: UPLOADS_ROOT };
  const definitions = options.definitions ?? DOCUMENT_TEMPLATE_SEEDS;

  let existing: Set<string>;
  try {
    existing = await records.findExistingKeys(definitions.map((definition) => definition.key));
  } catch (error) {
    throw new SeedingError(SEED_NAME, 'lookup of existing templates', error);
  }

  const items: SeedItemResult[] = [];
  for (const definition of definitions) {
    const item = { key: definition.key, asset: definition.assetFileName };
    if (existing.has(definition.key)) {
      items.push({ ...item, status: 'skipped' });
      continue;
    }

    const assetPath = path.join(paths.assetsDir, definition.assetFileName);
    if (!fs.existsSync(assetPath)) {
      throw new SeedingError(
        SEED_NAME,
        `lookup of the bundled asset for "${definition.key}"`,
        new Error(`seed asset "${definition.assetFileName}" is missing from seed-assets/document-templates`)
      );
    }

    let file: SeededTemplateFile;
    let storedPath: string;
    try {
      ({ file, storedPath } = copyAssetToUploads(definition, assetPath, paths.uploadsDir));
    } catch (error) {
      throw new SeedingError(SEED_NAME, `copy of the bundled asset for "${definition.key}"`, error);
    }
    options.onFileCreated?.(storedPath);

    let created: boolean;
    try {
      created = await records.createTemplate(definition, file);
    } catch (error) {
      removeSeededFile(storedPath, file.storageKey);
      throw new SeedingError(SEED_NAME, `creation of database records for "${definition.key}"`, error);
    }
    if (!created) removeSeededFile(storedPath, file.storageKey);
    items.push({ ...item, status: created ? 'created' : 'skipped' });
  }

  const created = items.filter((item) => item.status === 'created').length;
  return { name: SEED_NAME, label: 'Document templates', created, skipped: items.length - created, items };
}

/** Same layout as the upload endpoint: YYYY/MM/DD/<source>/<moduleHint>/<name>.
 *  The "seed-<key>" prefix keeps seeded files traceable; COPYFILE_EXCL
 *  guarantees an existing file is never overwritten. */
function copyAssetToUploads(
  definition: DocumentTemplateSeedDefinition,
  assetPath: string,
  uploadsDir: string
): { file: SeededTemplateFile; storedPath: string } {
  const now = new Date();
  const relativeDir = path.posix.join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    'api',
    'document-templates'
  );
  const fileName = `seed-${definition.key}-${now.getTime()}-${Math.round(Math.random() * 1e9)}${path.extname(definition.assetFileName)}`;
  const storageKey = `${relativeDir}/${fileName}`;
  const storedPath = path.join(uploadsDir, relativeDir, fileName);

  fs.mkdirSync(path.dirname(storedPath), { recursive: true });
  fs.copyFileSync(assetPath, storedPath, fs.constants.COPYFILE_EXCL);

  return {
    storedPath,
    file: {
      storageKey,
      originalName: definition.assetFileName,
      sizeBytes: fs.statSync(storedPath).size,
    },
  };
}

/** Best-effort removal of a file this seed run created. A failure is logged
 *  (with the storage key, not the absolute path) and never masks the error
 *  that triggered the cleanup; orphan cleanup remains the safety net. */
export function removeSeededFile(absolutePath: string, label: string): void {
  try {
    fs.rmSync(absolutePath, { force: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[seeding] Could not remove seeded file "${label}": ${reason}`);
  }
}

const STARTUP_CONTEXT: SeedRunContext = { trigger: 'startup' };

/** Audit entry for a seeded template. Startup keeps the system convention (no
 *  user, source startup-seed); a manual run names the SU who triggered it. */
export function templateCreationAudit(
  definition: DocumentTemplateSeedDefinition,
  templateId: number,
  context: SeedRunContext = STARTUP_CONTEXT
) {
  const manual = context.trigger === 'manual';
  return {
    userId: manual ? (context.actorUserId ?? null) : null,
    action: 'DOCUMENT_TEMPLATE_CREATED',
    module: 'M13',
    entityId: templateId,
    details: {
      key: definition.key,
      source: manual ? 'manual-run' : 'startup-seed',
      asset: definition.assetFileName,
    },
  };
}

type SeedExecutor = Pick<NodePgDatabase<typeof schema>, 'select' | 'insert' | 'update'>;

/** Writes through the caller's transaction, so the template, its current
 *  version, its upload asset and the audit entry commit or roll back together.
 *  Seeded rows are system-created: no uploader, even on a manual run (the SU
 *  triggered the run but did not upload the file); only the audit entry
 *  records who triggered it. */
export function createDbDocumentTemplateStore(
  executor: SeedExecutor,
  context: SeedRunContext = STARTUP_CONTEXT
): DocumentTemplateRecordStore {
  return {
    async findExistingKeys(keys) {
      const rows = await executor
        .select({ key: schema.documentTemplates.key })
        .from(schema.documentTemplates);
      return new Set(rows.map((row) => row.key).filter((key) => keys.includes(key)));
    },
    async createTemplate(definition, file) {
      const now = new Date();
      const [template] = await executor
        .insert(schema.documentTemplates)
        .values({ key: definition.key, label: definition.label, mimeType: definition.mimeType, uploadedAt: now })
        .onConflictDoNothing({ target: schema.documentTemplates.key })
        .returning({ id: schema.documentTemplates.id });
      if (!template) return false;

      // The asset is the file's identity; the template and its version
      // store the asset's stable address, never the physical path.
      const { address } = await insertAssetWithAddress(executor, {
        storageKey: file.storageKey,
        originalName: file.originalName,
        mimeType: definition.mimeType,
        sizeBytes: file.sizeBytes,
        uploadedFromApp: 'api',
        moduleHint: 'document-templates',
        linkedOwnerType: 'document_template',
        linkedOwnerId: template.id,
        linkedAt: now,
      });

      await executor
        .update(schema.documentTemplates)
        .set({ fileUrl: address })
        .where(eq(schema.documentTemplates.id, template.id));

      await executor.insert(schema.documentVersions).values({
        ownerType: 'document_template',
        ownerId: template.id,
        fileUrl: address,
        mimeType: definition.mimeType,
        isCurrent: true,
      });

      await executor.insert(schema.auditLogs).values(templateCreationAudit(definition, template.id, context));

      return true;
    },
  };
}
