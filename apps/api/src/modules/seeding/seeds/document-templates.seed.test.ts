import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ACCEPTED_DOCUMENT_MIME_TYPES, DOCUMENT_TEMPLATE_KEYS } from '@aidn/shared';
import {
  BUNDLED_TEMPLATE_ASSETS_DIR,
  DOCUMENT_TEMPLATE_SEEDS,
  seedDocumentTemplates,
  type DocumentTemplateRecordStore,
  type TemplateSeedPaths,
} from './document-templates.seed.js';

interface TemplateRecord {
  label: string;
  fileUrl: string | null;
  mimeType: string | null;
  active: boolean;
  /** Set for seeded rows: the physical file the DB store registers as an asset. */
  storageKey?: string;
}

/** In-memory stand-in for document_templates (+ its version/asset rows),
 *  with the same unique-key contract as the DB store. */
function createMemoryRecords(initial: Record<string, TemplateRecord> = {}) {
  const rows = new Map(Object.entries(initial));
  const store: DocumentTemplateRecordStore = {
    async findExistingKeys(keys) {
      return new Set(keys.filter((key) => rows.has(key)));
    },
    async createTemplate(definition, file) {
      if (rows.has(definition.key)) return false;
      rows.set(definition.key, {
        label: definition.label,
        // The DB store stores the asset's stable address; the seed only hands over the file.
        fileUrl: null,
        storageKey: file.storageKey,
        mimeType: definition.mimeType,
        active: true,
      });
      return true;
    },
  };
  return { store, rows };
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

let tmpRoot: string;
let paths: TemplateSeedPaths;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-template-seed-'));
  paths = { assetsDir: path.join(tmpRoot, 'assets'), uploadsDir: path.join(tmpRoot, 'uploads') };
  fs.mkdirSync(paths.assetsDir);
  for (const definition of DOCUMENT_TEMPLATE_SEEDS) {
    fs.writeFileSync(path.join(paths.assetsDir, definition.assetFileName), `content of ${definition.key}`);
  }
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('document template seed mapping', () => {
  it('maps every known template key to exactly one distinct asset', () => {
    const keys = DOCUMENT_TEMPLATE_SEEDS.map((definition) => definition.key);
    assert.deepEqual([...keys].sort(), [...DOCUMENT_TEMPLATE_KEYS].sort());
    const assets = DOCUMENT_TEMPLATE_SEEDS.map((definition) => definition.assetFileName);
    assert.equal(new Set(assets).size, 4);
  });

  it('maps preliminary_evaluation_declaration to the F-E-015 pre-evaluation form', () => {
    const preliminary = DOCUMENT_TEMPLATE_SEEDS.find(
      (definition) => definition.key === 'preliminary_evaluation_declaration'
    );
    assert.equal(
      preliminary?.assetFileName,
      'DN-AIR-R2-3-F-E-015 FORMULAIRE DE DECLARATION DE PRE-EVALUATION.docx'
    );
  });

  it('maps each DN-AIR key to its own form number', () => {
    for (const code of ['010', '011', '012']) {
      const definition = DOCUMENT_TEMPLATE_SEEDS.find((d) => d.key === `dn_air_r2_3_f_e_${code}`);
      assert.ok(definition?.assetFileName.startsWith(`DN-AIR-R2-3-F-E-${code}`), code);
    }
  });

  it('uses accepted upload MIME types', () => {
    for (const definition of DOCUMENT_TEMPLATE_SEEDS) {
      assert.ok(
        (ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(definition.mimeType),
        definition.key
      );
    }
  });

  it('ships every mapped asset in the bundled seed-assets directory', () => {
    for (const definition of DOCUMENT_TEMPLATE_SEEDS) {
      assert.ok(
        fs.existsSync(path.join(BUNDLED_TEMPLATE_ASSETS_DIR, definition.assetFileName)),
        definition.assetFileName
      );
    }
  });
});

describe('seedDocumentTemplates', () => {
  it('creates all four templates when none exist, copying assets into uploads', async () => {
    const { store, rows } = createMemoryRecords();

    const result = await seedDocumentTemplates(store, { paths });

    assert.equal(result.name, 'document-templates');
    assert.equal(result.created, 4);
    assert.equal(result.skipped, 0);
    const files = listFiles(paths.uploadsDir);
    assert.equal(files.length, 4);
    for (const definition of DOCUMENT_TEMPLATE_SEEDS) {
      const record = rows.get(definition.key)!;
      assert.match(record.storageKey!, /^reference\/document-templates\/[^/]+\/[0-9a-f-]+\.docx$/);
      assert.ok(record.storageKey!.startsWith(`reference/document-templates/${definition.key}/`));
      const stored = path.join(paths.uploadsDir, record.storageKey!);
      assert.equal(fs.readFileSync(stored, 'utf8'), `content of ${definition.key}`);
    }
  });

  it('creates nothing and copies nothing on a second run', async () => {
    const { store } = createMemoryRecords();
    await seedDocumentTemplates(store, { paths });

    const second = await seedDocumentTemplates(store, { paths });

    assert.equal(second.created, 0);
    assert.equal(second.skipped, 4);
    assert.equal(listFiles(paths.uploadsDir).length, 4);
  });

  it('leaves an existing DN-managed template exactly as it is', async () => {
    const custom: TemplateRecord = {
      label: 'Version DN personnalisee',
      fileUrl: '/uploads/2026/01/01/admin/document-templates/dn.pdf',
      mimeType: 'application/pdf',
      active: false,
    };
    const { store, rows } = createMemoryRecords({ dn_air_r2_3_f_e_010: { ...custom } });

    const result = await seedDocumentTemplates(store, { paths });

    assert.deepEqual(rows.get('dn_air_r2_3_f_e_010'), custom);
    assert.equal(result.items.find((item) => item.key === 'dn_air_r2_3_f_e_010')?.status, 'skipped');
    assert.equal(listFiles(paths.uploadsDir).length, 3);
  });

  it('only creates the missing templates in a partially seeded install', async () => {
    const existing: TemplateRecord = { label: 'x', fileUrl: '/uploads/x.docx', mimeType: 'x', active: true };
    const { store } = createMemoryRecords({
      preliminary_evaluation_declaration: { ...existing },
      dn_air_r2_3_f_e_011: { ...existing },
    });

    const result = await seedDocumentTemplates(store, { paths });

    assert.equal(result.created, 2);
    assert.equal(result.skipped, 2);
    const created = result.items.filter((item) => item.status === 'created').map((item) => item.key);
    assert.deepEqual(created.sort(), ['dn_air_r2_3_f_e_010', 'dn_air_r2_3_f_e_012']);
  });

  it('does not repair an existing template whose file is missing', async () => {
    const broken: TemplateRecord = {
      label: 'DN-AIR-R2-3-F-E-012',
      fileUrl: '/uploads/2026/07/28/unknown/misc/gone.pdf',
      mimeType: 'application/pdf',
      active: true,
    };
    const { store, rows } = createMemoryRecords({ dn_air_r2_3_f_e_012: { ...broken } });

    const result = await seedDocumentTemplates(store, { paths });

    assert.deepEqual(rows.get('dn_air_r2_3_f_e_012'), broken);
    assert.equal(result.items.find((item) => item.key === 'dn_air_r2_3_f_e_012')?.status, 'skipped');
  });

  it('fails clearly when a required bundled asset is missing, without leaking paths', async () => {
    fs.rmSync(path.join(paths.assetsDir, 'DN-AIR-R2-3-F-E-011 MATRICE DE CONFORMITE.docx'));
    const { store, rows } = createMemoryRecords();

    await assert.rejects(seedDocumentTemplates(store, { paths }), (error: Error) => {
      assert.match(error.message, /document-templates/);
      assert.match(error.message, /dn_air_r2_3_f_e_011/);
      assert.match(error.message, /bundled asset/);
      assert.ok(!error.message.includes(tmpRoot), 'message must not contain absolute paths');
      return true;
    });
    assert.equal(rows.has('dn_air_r2_3_f_e_011'), false);
  });

  it('does not require an asset for a template that already exists', async () => {
    fs.rmSync(path.join(paths.assetsDir, 'DN-AIR-R2-3-F-E-012-FDAPM.docx'));
    const existing: TemplateRecord = { label: 'x', fileUrl: null, mimeType: null, active: true };
    const { store } = createMemoryRecords({ dn_air_r2_3_f_e_012: existing });

    const result = await seedDocumentTemplates(store, { paths });

    assert.equal(result.created, 3);
  });

  it('removes the copied file when creating the database records fails', async () => {
    const { store } = createMemoryRecords();
    const failing: DocumentTemplateRecordStore = {
      findExistingKeys: store.findExistingKeys,
      createTemplate: async (definition, file) => {
        if (definition.key === 'dn_air_r2_3_f_e_010') throw new Error('insert failed');
        return store.createTemplate(definition, file);
      },
    };

    await assert.rejects(seedDocumentTemplates(failing, { paths }), (error: Error) => {
      assert.match(error.message, /dn_air_r2_3_f_e_010/);
      assert.match(error.message, /database records/);
      assert.match(error.message, /insert failed/);
      return true;
    });
    const remaining = listFiles(paths.uploadsDir).map((file) => path.basename(file));
    assert.ok(!remaining.some((name) => name.includes('dn_air_r2_3_f_e_010')), remaining.join(','));
  });

  it('treats a key created concurrently as skipped and removes its copied file', async () => {
    const { store } = createMemoryRecords();
    const racing: DocumentTemplateRecordStore = {
      findExistingKeys: async () => new Set(),
      createTemplate: async (definition, file) =>
        definition.key === 'dn_air_r2_3_f_e_011' ? false : store.createTemplate(definition, file),
    };

    const result = await seedDocumentTemplates(racing, { paths });

    assert.equal(result.created, 3);
    assert.equal(result.skipped, 1);
    assert.equal(listFiles(paths.uploadsDir).length, 3);
  });

  it('reports each file it creates so a later rollback can remove it', async () => {
    const { store } = createMemoryRecords();
    const reported: string[] = [];

    await seedDocumentTemplates(store, { paths, onFileCreated: (file) => reported.push(file) });

    assert.equal(reported.length, 4);
    assert.ok(reported.every((file) => fs.existsSync(file)));
  });

  it('returns one item per template, in definition order, with the asset name', async () => {
    const { store } = createMemoryRecords({
      dn_air_r2_3_f_e_012: { label: 'x', fileUrl: null, mimeType: null, active: true },
    });

    const result = await seedDocumentTemplates(store, { paths });

    assert.deepEqual(
      result.items.map((item) => [item.key, item.status, item.asset]),
      DOCUMENT_TEMPLATE_SEEDS.map((definition) => [
        definition.key,
        definition.key === 'dn_air_r2_3_f_e_012' ? 'skipped' : 'created',
        definition.assetFileName,
      ])
    );
    assert.equal(result.label, 'Document templates');
  });
});
