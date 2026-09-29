/** STORAGE-0A - rewrite of stored /uploads/<key> addresses to stable
 *  /api/files/<id> addresses (script: storage:rewrite-addresses).
 *
 *  planAddressRewrite is pure (tested); loading and applying are thin DB
 *  steps. Rules: reuse the asset of a storage key (lowest id), register a
 *  missing one (keeping a missing file missing), link a referenced but
 *  unlinked asset to the owner its column implies (otherwise orphan cleanup
 *  would delete it), and never relink an asset owned by something else -
 *  that is a conflict and the row is left unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { fileAddress, parseFileAddress } from '@aidn/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../shared/db/schema.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { insertAssetWithAddress } from '../uploads/asset-registration.js';
import { resolveStoragePath } from './file-delivery.js';

/** Every column holding a file address, with the owner its rows imply.
 *  Not listed on purpose: meetings.ticket_document_url (unused by the app,
 *  to be dropped) and audit_logs.details (history is never rewritten). */
export const ADDRESS_COLUMNS = [
  { table: 'document_versions', column: 'file_url', ownerTypeSql: 'owner_type::text', ownerIdSql: 'owner_id', mimeSql: 'mime_type' },
  { table: 'upload_assets', column: 'file_url', ownerTypeSql: null, ownerIdSql: null, mimeSql: 'mime_type' },
  { table: 'document_templates', column: 'file_url', ownerTypeSql: "'document_template'", ownerIdSql: 'id', mimeSql: 'mime_type' },
  { table: 'formal_request_documents', column: 'file_url', ownerTypeSql: "'formal_request_document'", ownerIdSql: 'id', mimeSql: null },
  { table: 'document_evaluations', column: 'resubmitted_file_url', ownerTypeSql: "'formal_request_document'", ownerIdSql: 'formal_request_document_id', mimeSql: null },
  { table: 'preliminary_evaluation_forms', column: 'submitted_file_url', ownerTypeSql: "'preliminary_evaluation_form'", ownerIdSql: 'id', mimeSql: null },
  { table: 'payments', column: 'invoice_file_url', ownerTypeSql: "'payment_invoice'", ownerIdSql: 'id', mimeSql: null },
  { table: 'payments', column: 'proof_file_url', ownerTypeSql: "'payment_proof'", ownerIdSql: 'id', mimeSql: null },
  { table: 'meetings', column: 'cr_document_url', ownerTypeSql: "'meeting_report'", ownerIdSql: 'id', mimeSql: null },
  { table: 'phases', column: 'closure_document_url', ownerTypeSql: "'phase_closure_document'", ownerIdSql: 'id', mimeSql: null },
  { table: 'certificates', column: 'signed_file_url', ownerTypeSql: "'certificate_document'", ownerIdSql: 'id', mimeSql: null },
  { table: 'reports', column: 'file_url', ownerTypeSql: "'report'", ownerIdSql: 'id', mimeSql: null },
] as const;

export interface AddressRow {
  table: string;
  column: string;
  rowId: number;
  value: string;
  /** null for upload_assets rows (the row is the asset). */
  ownerType: string | null;
  ownerId: number | null;
  mimeType: string | null;
}

export interface ExistingAsset {
  id: number;
  storageKey: string;
  linkedOwnerType: string | null;
  linkedOwnerId: number | null;
  orphanedAt?: Date | null;
}

export type AssetRef = { existingId: number } | { registeredKey: string };

export interface AddressRewritePlan {
  registrations: Array<{
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    fileExists: boolean;
    ownerType: string;
    ownerId: number;
  }>;
  links: Array<{ assetId: number; ownerType: string; ownerId: number }>;
  /** STORAGE-0B - stable addresses whose asset was never linked (workflow
   *  attachments that sent no upload id); applied exactly like links. */
  repairs: Array<{ assetId: number; ownerType: string; ownerId: number; wasOrphaned: boolean }>;
  /** Stable addresses pointing at no asset - reported, never changed. */
  dangling: Array<{ table: string; column: string; rowId: number; value: string }>;
  rewrites: Array<{ table: string; column: string; rowId: number; from: string; asset: AssetRef }>;
  conflicts: Array<{
    table: string;
    column: string;
    rowId: number;
    value: string;
    assetId: number | null;
    expectedOwner: string;
    actualOwner: string;
  }>;
  skipped: Array<{ table: string; column: string; rowId: number; value: string }>;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.html': 'text/html',
};

function mimeFromExtension(storageKey: string): string {
  return MIME_BY_EXTENSION[path.extname(storageKey).toLowerCase()] ?? 'application/octet-stream';
}

function legacyKey(value: string): string | null {
  return value.startsWith('/uploads/') && value.length > '/uploads/'.length ? value.slice('/uploads/'.length) : null;
}

const ownerLabel = (type: string | null, id: number | null) => `${type}:${id}`;

type AssetState = { id: number; ownerType: string | null; ownerId: number | null; orphaned: boolean };

/** A row already holding /api/files/<id>: make sure that asset is linked to
 *  the owner the row implies. Never relinks - another owner is a conflict
 *  and the asset is left as it is. */
function planStableRepair(plan: AddressRewritePlan, row: AddressRow, assetId: number, byId: Map<number, AssetState>): void {
  if (row.ownerType === null || row.ownerId === null) return; // the asset row itself
  const state = byId.get(assetId);
  if (!state) {
    plan.dangling.push({ table: row.table, column: row.column, rowId: row.rowId, value: row.value });
    return;
  }
  if (state.ownerType === null) {
    plan.repairs.push({ assetId, ownerType: row.ownerType, ownerId: row.ownerId, wasOrphaned: state.orphaned });
    state.ownerType = row.ownerType;
    state.ownerId = row.ownerId;
    return;
  }
  if (state.ownerType !== row.ownerType || state.ownerId !== row.ownerId) {
    plan.conflicts.push({
      table: row.table,
      column: row.column,
      rowId: row.rowId,
      value: row.value,
      assetId,
      expectedOwner: ownerLabel(row.ownerType, row.ownerId),
      actualOwner: ownerLabel(state.ownerType, state.ownerId),
    });
  }
}

export function planAddressRewrite(
  rows: AddressRow[],
  assets: ExistingAsset[],
  fileInfo: (storageKey: string) => { exists: boolean; sizeBytes: number }
): AddressRewritePlan {
  const plan: AddressRewritePlan = {
    registrations: [],
    links: [],
    repairs: [],
    rewrites: [],
    conflicts: [],
    skipped: [],
    dangling: [],
  };

  // Lowest id wins for a storage key; link state evolves as the plan links
  // (one state object per asset, reachable by storage key and by id).
  const byKey = new Map<string, AssetState>();
  const byId = new Map<number, AssetState>();
  for (const asset of [...assets].sort((a, b) => a.id - b.id)) {
    const state: AssetState = {
      id: asset.id,
      ownerType: asset.linkedOwnerType,
      ownerId: asset.linkedOwnerId,
      orphaned: !!asset.orphanedAt,
    };
    byId.set(asset.id, state);
    if (!byKey.has(asset.storageKey)) byKey.set(asset.storageKey, state);
  }
  const registered = new Map<string, { ownerType: string; ownerId: number }>();

  const mimeByKey = new Map<string, string>();
  for (const row of rows) {
    const key = legacyKey(row.value);
    if (key && row.mimeType && !mimeByKey.has(key)) mimeByKey.set(key, row.mimeType);
  }

  for (const row of rows) {
    const stableId = parseFileAddress(row.value);
    if (stableId !== null) {
      planStableRepair(plan, row, stableId, byId);
      continue;
    }
    const key = legacyKey(row.value);
    if (!key) {
      plan.skipped.push({ table: row.table, column: row.column, rowId: row.rowId, value: row.value });
      continue;
    }
    const rewrite = (asset: AssetRef) =>
      plan.rewrites.push({ table: row.table, column: row.column, rowId: row.rowId, from: row.value, asset });
    const conflict = (assetId: number | null, actualOwner: string) =>
      plan.conflicts.push({
        table: row.table,
        column: row.column,
        rowId: row.rowId,
        value: row.value,
        assetId,
        expectedOwner: ownerLabel(row.ownerType, row.ownerId),
        actualOwner,
      });

    // The upload_assets row is the asset itself.
    if (row.ownerType === null || row.ownerId === null) {
      rewrite({ existingId: row.rowId });
      continue;
    }

    const existing = byKey.get(key);
    if (existing) {
      if (existing.ownerType === null) {
        plan.links.push({ assetId: existing.id, ownerType: row.ownerType, ownerId: row.ownerId });
        existing.ownerType = row.ownerType;
        existing.ownerId = row.ownerId;
      } else if (existing.ownerType !== row.ownerType || existing.ownerId !== row.ownerId) {
        conflict(existing.id, ownerLabel(existing.ownerType, existing.ownerId));
        continue;
      }
      rewrite({ existingId: existing.id });
      continue;
    }

    const claimed = registered.get(key);
    if (claimed) {
      if (claimed.ownerType !== row.ownerType || claimed.ownerId !== row.ownerId) {
        conflict(null, ownerLabel(claimed.ownerType, claimed.ownerId));
        continue;
      }
      rewrite({ registeredKey: key });
      continue;
    }

    const info = fileInfo(key);
    plan.registrations.push({
      storageKey: key,
      originalName: path.posix.basename(key),
      mimeType: mimeByKey.get(key) ?? mimeFromExtension(key),
      sizeBytes: info.exists ? info.sizeBytes : 0,
      fileExists: info.exists,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
    });
    registered.set(key, { ownerType: row.ownerType, ownerId: row.ownerId });
    rewrite({ registeredKey: key });
  }

  return plan;
}

// ── Database steps ──────────────────────────────────────────────────────────

type Executor = NodePgDatabase<typeof schema>;

function columnQuery(spec: (typeof ADDRESS_COLUMNS)[number]) {
  const ownerType = spec.ownerTypeSql ?? 'NULL';
  const ownerId = spec.ownerIdSql ?? 'NULL';
  const mime = spec.mimeSql ?? 'NULL';
  return sql.raw(
    `SELECT id AS row_id, ${spec.column} AS value, ${ownerType} AS owner_type, ${ownerId} AS owner_id, ${mime} AS mime_type
       FROM ${spec.table} WHERE ${spec.column} IS NOT NULL AND ${spec.column} <> '' ORDER BY id`
  );
}

export async function loadAddressRows(executor: Executor): Promise<AddressRow[]> {
  const rows: AddressRow[] = [];
  for (const spec of ADDRESS_COLUMNS) {
    const result = await executor.execute(columnQuery(spec));
    for (const r of result.rows as Array<Record<string, unknown>>) {
      rows.push({
        table: spec.table,
        column: spec.column,
        rowId: Number(r.row_id),
        value: String(r.value),
        ownerType: r.owner_type === null ? null : String(r.owner_type),
        ownerId: r.owner_id === null ? null : Number(r.owner_id),
        mimeType: r.mime_type === null ? null : String(r.mime_type),
      });
    }
  }
  return rows;
}

export async function loadExistingAssets(executor: Executor): Promise<ExistingAsset[]> {
  return executor
    .select({
      id: schema.uploadAssets.id,
      storageKey: schema.uploadAssets.storageKey,
      linkedOwnerType: schema.uploadAssets.linkedOwnerType,
      linkedOwnerId: schema.uploadAssets.linkedOwnerId,
      orphanedAt: schema.uploadAssets.orphanedAt,
    })
    .from(schema.uploadAssets);
}

export function diskFileInfo(storageKey: string): { exists: boolean; sizeBytes: number } {
  const fullPath = resolveStoragePath(UPLOADS_ROOT, storageKey);
  if (!fullPath) return { exists: false, sizeBytes: 0 };
  try {
    const stats = fs.statSync(fullPath);
    return stats.isFile() ? { exists: true, sizeBytes: stats.size } : { exists: false, sizeBytes: 0 };
  } catch {
    return { exists: false, sizeBytes: 0 };
  }
}

/** Applies a plan inside the caller's transaction. */
export async function applyAddressRewrite(tx: Executor, plan: AddressRewritePlan): Promise<void> {
  const registeredIds = new Map<string, number>();
  for (const registration of plan.registrations) {
    const { id } = await insertAssetWithAddress(tx, {
      storageKey: registration.storageKey,
      originalName: registration.originalName,
      mimeType: registration.mimeType,
      sizeBytes: registration.sizeBytes,
      uploadedFromApp: 'api',
      moduleHint: 'legacy',
      linkedOwnerType: registration.ownerType as (typeof schema.documentOwnerTypeEnum.enumValues)[number],
      linkedOwnerId: registration.ownerId,
      linkedAt: new Date(),
    });
    registeredIds.set(registration.storageKey, id);
  }

  for (const link of [...plan.links, ...plan.repairs]) {
    await tx
      .update(schema.uploadAssets)
      .set({
        linkedOwnerType: link.ownerType as (typeof schema.documentOwnerTypeEnum.enumValues)[number],
        linkedOwnerId: link.ownerId,
        linkedAt: new Date(),
        orphanedAt: null,
      })
      .where(eq(schema.uploadAssets.id, link.assetId));
  }

  for (const rewrite of plan.rewrites) {
    const id = 'existingId' in rewrite.asset ? rewrite.asset.existingId : registeredIds.get(rewrite.asset.registeredKey)!;
    // Table/column names come from ADDRESS_COLUMNS only (never user input);
    // values are bound parameters. The WHERE on the old value keeps the
    // update exact if a row changed since planning.
    await tx.execute(
      sql`UPDATE ${sql.identifier(rewrite.table)} SET ${sql.identifier(rewrite.column)} = ${fileAddress(id)}
          WHERE id = ${rewrite.rowId} AND ${sql.identifier(rewrite.column)} = ${rewrite.from}`
    );
  }
}

/** Remaining legacy addresses per column (startup warning, system status).
 *  Only columns the rewrite handles - the unused meeting ticket column and
 *  audit history are excluded so they never warn forever. */
export async function countLegacyAddresses(executor: Executor): Promise<{ total: number; byColumn: Record<string, number> }> {
  const byColumn: Record<string, number> = {};
  let total = 0;
  for (const spec of ADDRESS_COLUMNS) {
    const result = await executor.execute(
      sql.raw(`SELECT count(*)::int AS n FROM ${spec.table} WHERE ${spec.column} LIKE '/uploads/%'`)
    );
    const n = Number((result.rows[0] as { n: number }).n);
    if (n > 0) byColumn[`${spec.table}.${spec.column}`] = n;
    total += n;
  }
  return { total, byColumn };
}

