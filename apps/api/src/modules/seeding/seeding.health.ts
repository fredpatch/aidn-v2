/** System status for the SU "État du système" view (GET /api/seeding/status).
 *
 *  Observes only - never creates or changes anything. The expected reference
 *  data is the seed definitions themselves (no second list), compared with
 *  what the database actually holds. Each check fails soft: an unreachable
 *  database or storage is reported as a status, never as an endpoint error. */
import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { classifyTemplateHealth, type TemplateHealthStatus } from '@aidn/shared';
import * as schema from '../../shared/db/schema.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { countLegacyAddresses } from '../files/address-rewrite.js';
import { storedFilesExist } from '../files/stored-file.js';
import { DOCUMENT_TEMPLATE_SEEDS, type DocumentTemplateSeedDefinition } from './seeds/document-templates.seed.js';
import { SYSTEM_PARAMETER_SEEDS, type SystemParameterSeedDefinition } from './seeds/system-parameters.seed.js';

export type SectionStatus = 'healthy' | 'attention';
export type ServiceStatus = 'available' | 'unavailable';

/** Below this share of free space, the uploads disk needs attention. */
export const LOW_STORAGE_FREE_RATIO = 0.1;

export interface StorageCapacity {
  freeBytes: number;
  totalBytes: number;
}

export interface SystemParametersHealth {
  status: SectionStatus;
  expected: number;
  present: number;
  missing: number;
  items: { key: string; status: 'healthy' | 'missing' }[];
}

export interface DocumentTemplatesHealth {
  status: SectionStatus;
  expected: number;
  healthy: number;
  missing: number;
  fileMissing: number;
  inactive: number;
  unchecked: number;
  items: { key: string; label: string; status: TemplateHealthStatus }[];
}

export interface SystemStatus {
  checkedAt: string;
  overallStatus: SectionStatus;
  /** Items a manual run can create (missing parameters + missing templates). */
  missingCount: number;
  /** null when the database could not be queried. */
  referenceData: {
    systemParameters: SystemParametersHealth;
    documentTemplates: DocumentTemplatesHealth;
  } | null;
  infrastructure: {
    api: { status: 'available' };
    /** sizeBytes: space used by the AIDN database; null if not measurable.
     *  Free space on the database server is not measurable from SQL. */
    database: { status: ServiceStatus; sizeBytes: number | null };
    /** Capacity of the disk holding the uploads folder; null if unknown. */
    storage: { status: ServiceStatus; freeBytes: number | null; totalBytes: number | null; lowSpace: boolean };
  };
  /** legacyAddresses: stored /uploads/... addresses the rewrite script has
   *  not converted (unreachable files); null if not measurable. */
  files: { legacyAddresses: number | null };
}

export interface TemplateRowSnapshot {
  key: string;
  label: string;
  active: boolean;
  fileUrl: string | null;
}

export interface SystemStatusProbe {
  /** Throws when the database cannot be reached. */
  pingDatabase(): Promise<void>;
  checkStorage(): Promise<boolean>;
  findParameterKeys(): Promise<string[]>;
  findTemplates(): Promise<TemplateRowSnapshot[]>;
  fileExists(fileUrl: string): boolean | Promise<boolean>;
  /** Stored /uploads/... addresses not yet rewritten (STORAGE-0A). */
  countLegacyAddresses(): Promise<number>;
  databaseSizeBytes(): Promise<number>;
  storageCapacity(): Promise<StorageCapacity | null>;
}

export interface CollectOptions {
  parameterDefinitions?: readonly SystemParameterSeedDefinition[];
  templateDefinitions?: readonly DocumentTemplateSeedDefinition[];
  now?: Date;
}

function evaluateParameters(
  definitions: readonly SystemParameterSeedDefinition[],
  existingKeys: string[]
): SystemParametersHealth {
  const existing = new Set(existingKeys);
  const items = definitions.map((definition) => ({
    key: definition.key,
    status: existing.has(definition.key) ? ('healthy' as const) : ('missing' as const),
  }));
  const missing = items.filter((item) => item.status === 'missing').length;
  return {
    // An empty expected list is a configuration error, never "healthy".
    status: definitions.length > 0 && missing === 0 ? 'healthy' : 'attention',
    expected: definitions.length,
    present: definitions.length - missing,
    missing,
    items,
  };
}

async function evaluateTemplates(
  definitions: readonly DocumentTemplateSeedDefinition[],
  rows: TemplateRowSnapshot[],
  storageAvailable: boolean,
  fileExists: (fileUrl: string) => boolean | Promise<boolean>
): Promise<DocumentTemplatesHealth> {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const items: DocumentTemplatesHealth['items'] = [];
  for (const definition of definitions) {
    const row = byKey.get(definition.key);
    const status = classifyTemplateHealth(
      row && {
        active: row.active,
        fileUrl: row.fileUrl,
        // Only touch the disk when the answer can be trusted.
        fileExists: storageAvailable && row.active && row.fileUrl !== null ? await safeFileExists(fileExists, row.fileUrl) : false,
      },
      { storageAvailable }
    );
    items.push({ key: definition.key, label: row?.label ?? definition.label, status });
  }
  const count = (status: TemplateHealthStatus) => items.filter((item) => item.status === status).length;
  const healthy = count('healthy');
  return {
    status: definitions.length > 0 && healthy === definitions.length ? 'healthy' : 'attention',
    expected: definitions.length,
    healthy,
    missing: count('missing'),
    fileMissing: count('file_missing'),
    inactive: count('inactive'),
    unchecked: count('unchecked'),
    items,
  };
}

/** A single failing file check is an item state, not an endpoint failure. */
async function safeFileExists(fileExists: (fileUrl: string) => boolean | Promise<boolean>, fileUrl: string): Promise<boolean> {
  try {
    return await fileExists(fileUrl);
  } catch {
    return false;
  }
}

async function isDatabaseAvailable(probe: SystemStatusProbe): Promise<boolean> {
  try {
    await probe.pingDatabase();
    return true;
  } catch {
    return false;
  }
}

/** Optional measurements: a failure means "unknown", never an error. */
async function measure<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

async function isStorageAvailable(probe: SystemStatusProbe): Promise<boolean> {
  try {
    return await probe.checkStorage();
  } catch {
    return false;
  }
}

export async function collectSystemStatus(
  probe: SystemStatusProbe,
  options: CollectOptions = {}
): Promise<SystemStatus> {
  const parameterDefinitions = options.parameterDefinitions ?? SYSTEM_PARAMETER_SEEDS;
  const templateDefinitions = options.templateDefinitions ?? DOCUMENT_TEMPLATE_SEEDS;
  const checkedAt = (options.now ?? new Date()).toISOString();

  const [databaseReachable, storageAvailable] = await Promise.all([
    isDatabaseAvailable(probe),
    isStorageAvailable(probe),
  ]);

  let referenceData: SystemStatus['referenceData'] = null;
  if (databaseReachable) {
    try {
      const [parameterKeys, templateRows] = await Promise.all([probe.findParameterKeys(), probe.findTemplates()]);
      referenceData = {
        systemParameters: evaluateParameters(parameterDefinitions, parameterKeys),
        documentTemplates: await evaluateTemplates(templateDefinitions, templateRows, storageAvailable, probe.fileExists),
      };
    } catch (error) {
      console.error('[system-status] Reference data query failed:', error instanceof Error ? error.message : error);
    }
  }

  const databaseAvailable = referenceData !== null;
  const [databaseSize, capacity, legacyAddresses] = await Promise.all([
    databaseAvailable ? measure(() => probe.databaseSizeBytes()) : null,
    storageAvailable ? measure(() => probe.storageCapacity()) : null,
    databaseAvailable ? measure(() => probe.countLegacyAddresses()) : null,
  ]);
  const lowSpace =
    capacity !== null && capacity.totalBytes > 0 && capacity.freeBytes / capacity.totalBytes < LOW_STORAGE_FREE_RATIO;

  const missingCount = referenceData
    ? referenceData.systemParameters.missing + referenceData.documentTemplates.missing
    : 0;
  const healthy =
    databaseAvailable &&
    storageAvailable &&
    !lowSpace &&
    !(legacyAddresses !== null && legacyAddresses > 0) &&
    referenceData!.systemParameters.status === 'healthy' &&
    referenceData!.documentTemplates.status === 'healthy';

  return {
    checkedAt,
    overallStatus: healthy ? 'healthy' : 'attention',
    missingCount,
    referenceData,
    infrastructure: {
      api: { status: 'available' },
      database: { status: databaseAvailable ? 'available' : 'unavailable', sizeBytes: databaseSize },
      storage: {
        status: storageAvailable ? 'available' : 'unavailable',
        freeBytes: capacity?.freeBytes ?? null,
        totalBytes: capacity?.totalBytes ?? null,
        lowSpace,
      },
    },
    files: { legacyAddresses },
  };
}

/** The uploads root exists, is a folder, and is readable and writable.
 *  Nothing is written: no probe file is created on the upload volume. */
export async function checkStorageRoot(root: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(root);
    if (!stats.isDirectory()) return false;
    await fs.promises.access(root, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Free (usable by the API process) and total bytes of the disk holding
 *  `root`. Nothing is written. */
export async function checkStorageCapacity(root: string): Promise<StorageCapacity | null> {
  const stats = await fs.promises.statfs(root);
  const totalBytes = stats.blocks * stats.bsize;
  if (!(totalBytes > 0)) return null;
  return { freeBytes: stats.bavail * stats.bsize, totalBytes };
}

type StatusExecutor = NodePgDatabase<typeof schema>;

export function createDbSystemStatusProbe(executor: StatusExecutor): SystemStatusProbe {
  return {
    async pingDatabase() {
      await executor.execute(sql`SELECT 1`);
    },
    checkStorage: () => checkStorageRoot(UPLOADS_ROOT),
    async findParameterKeys() {
      const rows = await executor.select({ key: schema.systemParameters.key }).from(schema.systemParameters);
      return rows.map((row) => row.key);
    },
    async findTemplates() {
      return executor
        .select({
          key: schema.documentTemplates.key,
          label: schema.documentTemplates.label,
          active: schema.documentTemplates.active,
          fileUrl: schema.documentTemplates.fileUrl,
        })
        .from(schema.documentTemplates);
    },
    fileExists: async (fileUrl) => (await storedFilesExist([fileUrl]))[0],
    countLegacyAddresses: async () => (await countLegacyAddresses(executor)).total,
    async databaseSizeBytes() {
      const result = await executor.execute(sql`SELECT pg_database_size(current_database())::bigint AS size`);
      return Number((result.rows[0] as { size: string | number }).size);
    },
    storageCapacity: () => checkStorageCapacity(UPLOADS_ROOT),
  };
}
