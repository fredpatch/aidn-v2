import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyTemplateHealth } from '@aidn/shared';
import {
  checkStorageCapacity,
  checkStorageRoot,
  collectSystemStatus,
  type SystemStatusProbe,
  type TemplateRowSnapshot,
} from './seeding.health.js';
import { SYSTEM_PARAMETER_SEEDS, type SystemParameterSeedDefinition } from './seeds/system-parameters.seed.js';
import { DOCUMENT_TEMPLATE_SEEDS, type DocumentTemplateSeedDefinition } from './seeds/document-templates.seed.js';

const GB = 1024 ** 3;
const NOW = new Date('2026-09-25T11:42:00.000Z');

const PARAMS: SystemParameterSeedDefinition[] = [
  { key: 'alpha', defaultValue: '1', type: 'integer', module: 'AUTH', description: 'a' },
  { key: 'beta', defaultValue: '2', type: 'integer', module: 'AUTH', description: 'b' },
];

const TEMPLATES: DocumentTemplateSeedDefinition[] = [
  { key: 'preliminary_evaluation_declaration', label: 'Seed A', assetFileName: 'a.docx', mimeType: 'x' },
  { key: 'dn_air_r2_3_f_e_010', label: 'Seed B', assetFileName: 'b.docx', mimeType: 'x' },
];

const EXISTING_FILE = '/uploads/2026/09/25/api/document-templates/ok.docx';

function row(key: string, overrides: Partial<TemplateRowSnapshot> = {}): TemplateRowSnapshot {
  return { key, label: `Row ${key}`, active: true, fileUrl: EXISTING_FILE, ...overrides };
}

interface ProbeState {
  database?: boolean;
  storage?: boolean;
  parameterKeys?: string[];
  templates?: TemplateRowSnapshot[];
  failTemplateQuery?: boolean;
  databaseSize?: number | Error;
  capacity?: { freeBytes: number; totalBytes: number } | Error;
  legacyAddresses?: number | Error;
}

function probe(state: ProbeState = {}): SystemStatusProbe & { referenceQueries: number } {
  const p = {
    referenceQueries: 0,
    async pingDatabase() {
      if (state.database === false) throw new Error('connect ECONNREFUSED');
    },
    async checkStorage() {
      return state.storage ?? true;
    },
    async findParameterKeys() {
      p.referenceQueries++;
      return state.parameterKeys ?? PARAMS.map((d) => d.key);
    },
    async findTemplates() {
      p.referenceQueries++;
      if (state.failTemplateQuery) throw new Error('relation does not exist');
      return state.templates ?? TEMPLATES.map((d) => row(d.key));
    },
    fileExists(fileUrl: string) {
      return fileUrl === EXISTING_FILE;
    },
    async databaseSizeBytes() {
      if (state.databaseSize instanceof Error) throw state.databaseSize;
      return state.databaseSize ?? 52_428_800;
    },
    async countLegacyAddresses() {
      if (state.legacyAddresses instanceof Error) throw state.legacyAddresses;
      return state.legacyAddresses ?? 0;
    },
    async storageCapacity() {
      if (state.capacity instanceof Error) throw state.capacity;
      return state.capacity ?? { freeBytes: 60 * GB, totalBytes: 100 * GB };
    },
  };
  return p;
}

function collect(state: ProbeState = {}, definitions: { params?: SystemParameterSeedDefinition[]; templates?: DocumentTemplateSeedDefinition[] } = {}) {
  return collectSystemStatus(probe(state), {
    parameterDefinitions: definitions.params ?? PARAMS,
    templateDefinitions: definitions.templates ?? TEMPLATES,
    now: NOW,
  });
}

// --- shared precedence -----------------------------------------------------

test('classifyTemplateHealth: no row is missing', () => {
  assert.equal(classifyTemplateHealth(undefined, { storageAvailable: true }), 'missing');
  assert.equal(classifyTemplateHealth(undefined, { storageAvailable: false }), 'missing');
});

test('classifyTemplateHealth: inactive wins over a missing file and over unavailable storage', () => {
  const inactive = { active: false, fileUrl: null, fileExists: false };
  assert.equal(classifyTemplateHealth(inactive, { storageAvailable: true }), 'inactive');
  assert.equal(classifyTemplateHealth(inactive, { storageAvailable: false }), 'inactive');
});

test('classifyTemplateHealth: active row is unchecked when storage is unavailable', () => {
  assert.equal(
    classifyTemplateHealth({ active: true, fileUrl: EXISTING_FILE, fileExists: false }, { storageAvailable: false }),
    'unchecked'
  );
});

test('classifyTemplateHealth: active row with a null or absent file is file_missing', () => {
  assert.equal(classifyTemplateHealth({ active: true, fileUrl: null, fileExists: false }, { storageAvailable: true }), 'file_missing');
  assert.equal(classifyTemplateHealth({ active: true, fileUrl: EXISTING_FILE, fileExists: false }, { storageAvailable: true }), 'file_missing');
});

test('classifyTemplateHealth: active row with an existing file is healthy', () => {
  assert.equal(classifyTemplateHealth({ active: true, fileUrl: EXISTING_FILE, fileExists: true }, { storageAvailable: true }), 'healthy');
});

// --- collectSystemStatus ---------------------------------------------------

test('everything present and reachable is healthy', async () => {
  const status = await collect();
  assert.equal(status.checkedAt, NOW.toISOString());
  assert.equal(status.overallStatus, 'healthy');
  assert.equal(status.missingCount, 0);
  assert.deepEqual(status.infrastructure, {
    api: { status: 'available' },
    database: { status: 'available', sizeBytes: 52_428_800 },
    storage: { status: 'available', freeBytes: 60 * GB, totalBytes: 100 * GB, lowSpace: false },
  });
  assert.deepEqual(status.referenceData?.systemParameters, {
    status: 'healthy',
    expected: 2,
    present: 2,
    missing: 0,
    items: [
      { key: 'alpha', status: 'healthy' },
      { key: 'beta', status: 'healthy' },
    ],
  });
  const templates = status.referenceData?.documentTemplates;
  assert.equal(templates?.status, 'healthy');
  assert.equal(templates?.healthy, 2);
});

test('a missing parameter needs attention and is counted as creatable', async () => {
  const status = await collect({ parameterKeys: ['alpha'] });
  const params = status.referenceData!.systemParameters;
  assert.equal(params.status, 'attention');
  assert.equal(params.present, 1);
  assert.equal(params.missing, 1);
  assert.deepEqual(params.items[1], { key: 'beta', status: 'missing' });
  assert.equal(status.overallStatus, 'attention');
  assert.equal(status.missingCount, 1);
});

test('parameters in the database but not in the seed list are ignored', async () => {
  const status = await collect({ parameterKeys: ['alpha', 'beta', 'legacy_key'] });
  assert.equal(status.referenceData!.systemParameters.present, 2);
  assert.equal(status.referenceData!.systemParameters.items.length, 2);
  assert.equal(status.overallStatus, 'healthy');
});

test('template states and counts follow the shared precedence', async () => {
  const status = await collect(
    {
      templates: [row('preliminary_evaluation_declaration', { active: false, fileUrl: null })],
    },
    {
      templates: [
        ...TEMPLATES,
        { key: 'dn_air_r2_3_f_e_011', label: 'Seed C', assetFileName: 'c.docx', mimeType: 'x' },
      ],
    }
  );
  const templates = status.referenceData!.documentTemplates;
  assert.deepEqual(
    templates.items.map((item) => item.status),
    ['inactive', 'missing', 'missing']
  );
  assert.equal(templates.inactive, 1);
  assert.equal(templates.missing, 2);
  assert.equal(templates.status, 'attention');
});

test('an active template whose file is gone or null is file_missing', async () => {
  const status = await collect({
    templates: [
      row('preliminary_evaluation_declaration', { fileUrl: '/uploads/gone.docx' }),
      row('dn_air_r2_3_f_e_010', { fileUrl: null }),
    ],
  });
  const templates = status.referenceData!.documentTemplates;
  assert.deepEqual(templates.items.map((item) => item.status), ['file_missing', 'file_missing']);
  assert.equal(templates.fileMissing, 2);
  assert.equal(status.missingCount, 0, 'broken templates are not creatable');
  assert.equal(status.overallStatus, 'attention');
});

test('storage unavailable marks active templates unchecked, not file_missing', async () => {
  const status = await collect({
    storage: false,
    templates: [row('preliminary_evaluation_declaration')],
  });
  const templates = status.referenceData!.documentTemplates;
  assert.deepEqual(templates.items.map((item) => item.status), ['unchecked', 'missing']);
  assert.equal(templates.unchecked, 1);
  assert.equal(templates.fileMissing, 0);
  assert.equal(status.infrastructure.storage.status, 'unavailable');
  assert.equal(status.overallStatus, 'attention');
  assert.equal(status.missingCount, 1);
});

test('database unavailable returns infrastructure only and skips reference queries', async () => {
  const p = probe({ database: false, storage: true });
  const status = await collectSystemStatus(p, { parameterDefinitions: PARAMS, templateDefinitions: TEMPLATES, now: NOW });
  assert.equal(status.referenceData, null);
  assert.equal(status.infrastructure.database.status, 'unavailable');
  assert.equal(status.infrastructure.storage.status, 'available');
  assert.equal(status.overallStatus, 'attention');
  assert.equal(status.missingCount, 0);
  assert.equal(p.referenceQueries, 0);
});

test('a failing reference query is reported as database unavailable', async () => {
  const status = await collect({ failTemplateQuery: true });
  assert.equal(status.referenceData, null);
  assert.equal(status.infrastructure.database.status, 'unavailable');
  assert.equal(status.overallStatus, 'attention');
});

test('an empty expected list is never reported as healthy', async () => {
  const status = await collect({}, { params: [], templates: [] });
  assert.equal(status.referenceData!.systemParameters.status, 'attention');
  assert.equal(status.referenceData!.documentTemplates.status, 'attention');
  assert.equal(status.overallStatus, 'attention');
});

test('template label is the stored label when a row exists, else the seed label', async () => {
  const status = await collect({ templates: [row('preliminary_evaluation_declaration', { label: 'Libellé DN' })] });
  assert.deepEqual(
    status.referenceData!.documentTemplates.items.map((item) => item.label),
    ['Libellé DN', 'Seed B']
  );
});

test('by default the expected state comes from the seed definitions', async () => {
  assert.ok(SYSTEM_PARAMETER_SEEDS.length > 0);
  assert.ok(DOCUMENT_TEMPLATE_SEEDS.length > 0);
  const status = await collectSystemStatus(probe({ parameterKeys: [], templates: [] }), { now: NOW });
  assert.equal(status.referenceData!.systemParameters.expected, SYSTEM_PARAMETER_SEEDS.length);
  assert.equal(status.referenceData!.documentTemplates.expected, DOCUMENT_TEMPLATE_SEEDS.length);
  assert.equal(status.missingCount, SYSTEM_PARAMETER_SEEDS.length + DOCUMENT_TEMPLATE_SEEDS.length);
});

// --- storage check (real file system) --------------------------------------

test('checkStorageRoot: an existing writable folder is available', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-storage-'));
  try {
    assert.equal(await checkStorageRoot(dir), true);
    assert.deepEqual(fs.readdirSync(dir), [], 'the check must not write anything');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('checkStorageRoot: a missing folder or a plain file is unavailable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-storage-'));
  try {
    const file = path.join(dir, 'not-a-folder.txt');
    fs.writeFileSync(file, 'x');
    assert.equal(await checkStorageRoot(path.join(dir, 'absent')), false);
    assert.equal(await checkStorageRoot(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- capacity ---------------------------------------------------------------

test('database size is reported, and null when the database is unreachable', async () => {
  assert.equal((await collect({ databaseSize: 1234 })).infrastructure.database.sizeBytes, 1234);
  assert.equal((await collect({ database: false })).infrastructure.database.sizeBytes, null);
});

test('a failing size query leaves the database available with an unknown size', async () => {
  const status = await collect({ databaseSize: new Error('permission denied') });
  assert.equal(status.infrastructure.database.status, 'available');
  assert.equal(status.infrastructure.database.sizeBytes, null);
  assert.equal(status.overallStatus, 'healthy');
});

test('less than 10% free on the uploads disk is low space and needs attention', async () => {
  const low = await collect({ capacity: { freeBytes: 9 * GB, totalBytes: 100 * GB } });
  assert.equal(low.infrastructure.storage.lowSpace, true);
  assert.equal(low.infrastructure.storage.status, 'available');
  assert.equal(low.overallStatus, 'attention');

  const limit = await collect({ capacity: { freeBytes: 10 * GB, totalBytes: 100 * GB } });
  assert.equal(limit.infrastructure.storage.lowSpace, false);
  assert.equal(limit.overallStatus, 'healthy');
});

test('an unreadable capacity is unknown, never low space', async () => {
  const status = await collect({ capacity: new Error('ENOSYS') });
  assert.deepEqual(status.infrastructure.storage, {
    status: 'available',
    freeBytes: null,
    totalBytes: null,
    lowSpace: false,
  });
  assert.equal(status.overallStatus, 'healthy');
});

test('capacity is not read when storage is unavailable', async () => {
  const status = await collect({ storage: false });
  assert.equal(status.infrastructure.storage.freeBytes, null);
  assert.equal(status.infrastructure.storage.lowSpace, false);
});

test('checkStorageCapacity reads the real disk of a folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-capacity-'));
  try {
    const capacity = await checkStorageCapacity(dir);
    assert.ok(capacity && capacity.totalBytes > 0 && capacity.freeBytes >= 0 && capacity.freeBytes <= capacity.totalBytes);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- legacy file addresses (STORAGE-0A) ------------------------------------

test('remaining legacy /uploads addresses are counted and need attention', async () => {
  const clean = await collect();
  assert.deepEqual(clean.files, { legacyAddresses: 0 });
  assert.equal(clean.overallStatus, 'healthy');

  const legacy = await collect({ legacyAddresses: 3 });
  assert.deepEqual(legacy.files, { legacyAddresses: 3 });
  assert.equal(legacy.overallStatus, 'attention');
});

test('an unmeasurable legacy count is unknown, never an error', async () => {
  assert.deepEqual((await collect({ legacyAddresses: new Error('boom') })).files, { legacyAddresses: null });
  assert.deepEqual((await collect({ database: false })).files, { legacyAddresses: null });
});

test('file checks may be asynchronous (stable addresses resolve through the database)', async () => {
  const p = probe({});
  const status = await collectSystemStatus(
    // Resolves to false: an un-awaited Promise would wrongly count as present.
    { ...p, fileExists: async () => false },
    { parameterDefinitions: PARAMS, templateDefinitions: TEMPLATES, now: NOW }
  );
  assert.equal(status.referenceData!.documentTemplates.fileMissing, 2);
});
