import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeReferenceTemplateStorageKey,
  relocateReferenceAssetAfterCommit,
  type RelocateReferenceAssetAfterCommitDeps,
} from './relocate-reference-asset.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-relocate-ref-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(root: string, key: string, content = 'x'): void {
  const full = path.join(root, key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function exists(root: string, key: string): boolean {
  return fs.existsSync(path.join(root, key));
}

describe('computeReferenceTemplateStorageKey', () => {
  it('builds reference/document-templates/<key>/<filename>, reusing the staging filename unchanged', () => {
    const key = computeReferenceTemplateStorageKey('dn_air_r2_3_f_e_010', 'staging/2026/09/29/uuid-1.docx');
    assert.equal(key, 'reference/document-templates/dn_air_r2_3_f_e_010/uuid-1.docx');
  });

  it('never uses anything from the staging key besides its final filename segment', () => {
    const key = computeReferenceTemplateStorageKey('dn_air_r2_3_f_e_011', 'staging/2026/01/02/uuid-2.docx');
    assert.ok(!key.includes('2026/01/02'));
    assert.ok(key.endsWith('/uuid-2.docx'));
  });
});

describe('relocateReferenceAssetAfterCommit', () => {
  function deps(
    overrides: Partial<RelocateReferenceAssetAfterCommitDeps> & { initialKey?: string; uploadedFromApp?: string } = {}
  ): {
    deps: RelocateReferenceAssetAfterCommitDeps;
    getKey: () => string | undefined;
  } {
    let key: string | undefined = overrides.initialKey ?? 'staging/2026/09/29/uuid-1.docx';
    const uploadedFromApp = overrides.uploadedFromApp ?? 'admin';
    const d: RelocateReferenceAssetAfterCommitDeps = {
      loadAsset: overrides.loadAsset ?? (async () => (key === undefined ? undefined : { storageKey: key, uploadedFromApp })),
      casStorageKey:
        overrides.casStorageKey ??
        (async (_id, expectedOld, newKey) => {
          if (key !== expectedOld) return false;
          key = newKey;
          return true;
        }),
      root,
    };
    return { deps: d, getKey: () => key };
  }

  it('moves a staged template to its canonical reference location and updates storage_key', async () => {
    write(root, 'staging/2026/09/29/uuid-1.docx', 'hello');
    const { deps: d, getKey } = deps();
    const outcome = await relocateReferenceAssetAfterCommit(41, 'dn_air_r2_3_f_e_010', d);
    assert.equal(outcome.status, 'moved');
    assert.equal(getKey(), 'reference/document-templates/dn_air_r2_3_f_e_010/uuid-1.docx');
    assert.equal(exists(root, 'reference/document-templates/dn_air_r2_3_f_e_010/uuid-1.docx'), true);
  });

  it('is a no-op for a legacy, non-staging-prefixed storage_key (e.g. a pre-STORAGE-3 seeded path)', async () => {
    write(root, '2026/09/25/api/document-templates/seed-x.docx', 'legacy-seed');
    const { deps: d, getKey } = deps({ initialKey: '2026/09/25/api/document-templates/seed-x.docx' });
    const outcome = await relocateReferenceAssetAfterCommit(41, 'dn_air_r2_3_f_e_010', d);
    assert.equal(outcome.status, 'skipped_not_staging');
    assert.equal(getKey(), '2026/09/25/api/document-templates/seed-x.docx');
    assert.equal(exists(root, '2026/09/25/api/document-templates/seed-x.docx'), true);
  });

  it('linked-but-staging repair via retry relocates the file (self-healing)', async () => {
    write(root, 'staging/2026/09/29/uuid-2.docx', 'repair-me');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-2.docx' });
    const outcome = await relocateReferenceAssetAfterCommit(55, 'dn_air_r2_3_f_e_011', d);
    assert.equal(outcome.status, 'moved');
    assert.equal(getKey(), 'reference/document-templates/dn_air_r2_3_f_e_011/uuid-2.docx');
  });

  it('the critical crash case: rename already succeeded, storage_key update never landed - repair reconciles without reporting the file lost', async () => {
    write(root, 'reference/document-templates/dn_air_r2_3_f_e_012/uuid-3.docx', 'moved-before-crash');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-3.docx' });
    const outcome = await relocateReferenceAssetAfterCommit(77, 'dn_air_r2_3_f_e_012', d);
    assert.equal(outcome.status, 'reconciled');
    assert.equal(outcome.error, undefined);
    assert.equal(getKey(), 'reference/document-templates/dn_air_r2_3_f_e_012/uuid-3.docx');
  });

  it('a genuine move failure is caught, logged, and leaves storage_key untouched', async () => {
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-gone.docx' });
    const outcome = await relocateReferenceAssetAfterCommit(88, 'dn_air_r2_3_f_e_010', d);
    assert.equal(outcome.status, 'error');
    assert.equal(outcome.error, 'STORAGE_SOURCE_MISSING');
    assert.equal(getKey(), 'staging/2026/09/29/uuid-gone.docx');
  });

  it('STORAGE-3 defense-in-depth: a seeded (uploadedFromApp "api") template row is never relocated, even if mistakenly called', async () => {
    write(root, 'reference/document-templates/dn_air_r2_3_f_e_010/uuid-seed.docx', 'seeded');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-seed.docx', uploadedFromApp: 'api' });
    const outcome = await relocateReferenceAssetAfterCommit(90, 'dn_air_r2_3_f_e_010', d);
    assert.equal(outcome.status, 'skipped_server_generated');
    assert.equal(getKey(), 'staging/2026/09/29/uuid-seed.docx');
  });

  it('a concurrent relocation losing the optimistic update reports skipped_stale, not an error', async () => {
    write(root, 'staging/2026/09/29/uuid-6.docx', 'race');
    const { deps: d } = deps({
      initialKey: 'staging/2026/09/29/uuid-6.docx',
      casStorageKey: async () => false,
    });
    const outcome = await relocateReferenceAssetAfterCommit(101, 'dn_air_r2_3_f_e_010', d);
    assert.equal(outcome.status, 'skipped_stale');
  });

  it('never throws, even when loadAsset itself rejects', async () => {
    const { deps: d } = deps({ loadAsset: async () => { throw new Error('DB_DOWN'); } });
    const outcome = await relocateReferenceAssetAfterCommit(102, 'dn_air_r2_3_f_e_010', d);
    assert.equal(outcome.status, 'error');
    assert.equal(outcome.error, 'DB_DOWN');
  });
});
