import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { relocateDossierAssetAfterCommit, relocateFile, realFsOps, type FsOps, type RelocateDossierAssetAfterCommitDeps } from './relocate-asset.js';
import type { StorageContext } from '../uploads/storage-context.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidn-relocate-'));
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

describe('relocateFile', () => {
  it('moves the file from the staging key to the target key', async () => {
    write(root, 'staging/2026/09/29/uuid-1.pdf', 'hello');
    const status = await relocateFile(root, 'staging/2026/09/29/uuid-1.pdf', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf');
    assert.equal(status, 'moved');
    assert.equal(exists(root, 'staging/2026/09/29/uuid-1.pdf'), false);
    assert.equal(fs.readFileSync(path.join(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf'), 'utf8'), 'hello');
  });

  it('the critical crash case: target already exists and source is gone -> reconciled, no throw', async () => {
    // Simulates: fs.rename succeeded, then the storage_key DB update never
    // committed. The source is gone; the canonical target already has it.
    write(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf', 'already-there');
    const status = await relocateFile(root, 'staging/2026/09/29/uuid-1.pdf', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf');
    assert.equal(status, 'reconciled');
  });

  it('target already exists even though source still exists too -> reconciled, never re-moves or overwrites', async () => {
    write(root, 'staging/2026/09/29/uuid-1.pdf', 'source-copy');
    write(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf', 'canonical-copy');
    const status = await relocateFile(root, 'staging/2026/09/29/uuid-1.pdf', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf');
    assert.equal(status, 'reconciled');
    assert.equal(fs.readFileSync(path.join(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf'), 'utf8'), 'canonical-copy');
  });

  it('genuinely lost file: neither target nor source exists -> throws (caller logs, does not reconcile)', async () => {
    await assert.rejects(
      relocateFile(root, 'staging/2026/09/29/uuid-missing.pdf', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-missing.pdf'),
      { message: 'STORAGE_SOURCE_MISSING' }
    );
  });

  it('rejects a target or source that would escape the uploads root (path confinement)', async () => {
    write(root, 'staging/2026/09/29/uuid-1.pdf', 'x');
    await assert.rejects(relocateFile(root, '../../etc/passwd', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf'), {
      message: 'STORAGE_PATH_CONFINEMENT',
    });
    await assert.rejects(relocateFile(root, 'staging/2026/09/29/uuid-1.pdf', '../../etc/passwd'), {
      message: 'STORAGE_PATH_CONFINEMENT',
    });
  });

  it('EXDEV fallback: copies then unlinks the source when rename reports a cross-device error', async () => {
    write(root, 'staging/2026/09/29/uuid-1.pdf', 'exdev-content');
    const fsOps: FsOps = {
      ...realFsOps,
      rename: async () => {
        const err = new Error('cross-device') as NodeJS.ErrnoException;
        err.code = 'EXDEV';
        throw err;
      },
    };
    const status = await relocateFile(root, 'staging/2026/09/29/uuid-1.pdf', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf', fsOps);
    assert.equal(status, 'moved');
    assert.equal(exists(root, 'staging/2026/09/29/uuid-1.pdf'), false);
    assert.equal(fs.readFileSync(path.join(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf'), 'utf8'), 'exdev-content');
  });

  it('EXDEV fallback cleans up a partial destination copy when the copy itself fails', async () => {
    write(root, 'staging/2026/09/29/uuid-1.pdf', 'x');
    const fsOps: FsOps = {
      ...realFsOps,
      rename: async () => {
        const err = new Error('cross-device') as NodeJS.ErrnoException;
        err.code = 'EXDEV';
        throw err;
      },
      copyFile: async (from, to) => {
        // Simulate a partial write before failing.
        fs.writeFileSync(to, 'partial');
        throw new Error('ENOSPC: no space left');
      },
    };
    await assert.rejects(
      relocateFile(root, 'staging/2026/09/29/uuid-1.pdf', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf', fsOps),
      { message: 'ENOSPC: no space left' }
    );
    assert.equal(exists(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf'), false, 'partial destination cleaned up');
    assert.equal(exists(root, 'staging/2026/09/29/uuid-1.pdf'), true, 'source untouched');
  });

  it('a genuine fs failure during rename (not EXDEV) propagates and does not leave a partial destination', async () => {
    write(root, 'staging/2026/09/29/uuid-1.pdf', 'x');
    const fsOps: FsOps = {
      ...realFsOps,
      rename: async () => {
        throw new Error('EACCES: permission denied');
      },
    };
    await assert.rejects(
      relocateFile(root, 'staging/2026/09/29/uuid-1.pdf', 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf', fsOps),
      { message: 'EACCES: permission denied' }
    );
    assert.equal(exists(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf'), false);
    assert.equal(exists(root, 'staging/2026/09/29/uuid-1.pdf'), true, 'source untouched on failure');
  });
});

describe('relocateDossierAssetAfterCommit', () => {
  const certificateContext: StorageContext = {
    requestReference: 'DEM-REF',
    phaseFolder: 'M7-delivrance',
    categorySlug: 'certificates',
  };

  function deps(
    overrides: Partial<RelocateDossierAssetAfterCommitDeps> & { initialKey?: string; uploadedFromApp?: string } = {}
  ): {
    deps: RelocateDossierAssetAfterCommitDeps;
    getKey: () => string | undefined;
  } {
    let key: string | undefined = overrides.initialKey ?? 'staging/2026/09/29/uuid-1.pdf';
    const uploadedFromApp = overrides.uploadedFromApp ?? 'portal';
    const d: RelocateDossierAssetAfterCommitDeps = {
      loadAsset: overrides.loadAsset ?? (async () => (key === undefined ? undefined : { storageKey: key, uploadedFromApp })),
      casStorageKey:
        overrides.casStorageKey ??
        (async (_id, expectedOld, newKey) => {
          if (key !== expectedOld) return false;
          key = newKey;
          return true;
        }),
      root,
      contextDeps: overrides.contextDeps ?? {
        dgCircuitDocument: async () => undefined,
        formalRequestDocument: async () => undefined,
        preliminaryEvaluationForm: async () => undefined,
        payment: async () => undefined,
        meetingReport: async () => undefined,
        phaseClosure: async () => undefined,
        certificate: async () => ({ reference: 'DEM-REF' }),
      },
    };
    return { deps: d, getKey: () => key };
  }

  it('moves a staging asset to its canonical dossier location and updates storage_key', async () => {
    write(root, 'staging/2026/09/29/uuid-1.pdf', 'hello');
    const { deps: d, getKey } = deps();
    const outcome = await relocateDossierAssetAfterCommit(41, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'moved');
    assert.equal(getKey(), 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf');
    assert.equal(exists(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf'), true);
  });

  it('is a no-op for a legacy, non-staging-prefixed storage_key', async () => {
    write(root, '2026/09/25/portal/misc/legacy.pdf', 'legacy');
    const { deps: d, getKey } = deps({ initialKey: '2026/09/25/portal/misc/legacy.pdf' });
    const outcome = await relocateDossierAssetAfterCommit(41, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'skipped_not_staging');
    assert.equal(getKey(), '2026/09/25/portal/misc/legacy.pdf');
    assert.equal(exists(root, '2026/09/25/portal/misc/legacy.pdf'), true);
  });

  it('same-target attach retry is a no-op: already-relocated asset is untouched', async () => {
    write(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf', 'already');
    const { deps: d, getKey } = deps({ initialKey: 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf' });
    const outcome = await relocateDossierAssetAfterCommit(41, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'skipped_not_staging');
    assert.equal(getKey(), 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-1.pdf');
  });

  it('linked-but-staging repair via retry relocates the file (self-healing)', async () => {
    write(root, 'staging/2026/09/29/uuid-2.pdf', 'repair-me');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-2.pdf' });
    const outcome = await relocateDossierAssetAfterCommit(55, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'moved');
    assert.equal(getKey(), 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-2.pdf');
  });

  it('the critical crash case end-to-end: rename already succeeded, storage_key update never landed - repair reconciles without reporting the file lost', async () => {
    // The file is already at the canonical target (rename succeeded before
    // the crash); storage_key still says staging/...
    write(root, 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-3.pdf', 'moved-before-crash');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-3.pdf' });
    const outcome = await relocateDossierAssetAfterCommit(77, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'reconciled');
    assert.equal(outcome.error, undefined);
    assert.equal(getKey(), 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-3.pdf');
  });

  it('a genuine move failure is caught, logged, and leaves storage_key untouched', async () => {
    // Neither target nor source exists - relocateFile throws STORAGE_SOURCE_MISSING.
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-gone.pdf' });
    const outcome = await relocateDossierAssetAfterCommit(88, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'error');
    assert.equal(outcome.error, 'STORAGE_SOURCE_MISSING');
    assert.equal(getKey(), 'staging/2026/09/29/uuid-gone.pdf');
  });

  it('excluded owner types (document_template, report) are never relocated', async () => {
    write(root, 'staging/2026/09/29/uuid-4.pdf', 'template');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-4.pdf' });
    const outcome = await relocateDossierAssetAfterCommit(99, { ownerType: 'document_template', ownerId: 1 }, d);
    assert.equal(outcome.status, 'skipped_not_relocatable');
    assert.equal(getKey(), 'staging/2026/09/29/uuid-4.pdf');
  });

  it('certificate dual producer: a signed-return browser upload is relocated normally', async () => {
    write(root, 'staging/2026/09/29/uuid-5.pdf', 'signed-scan');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-5.pdf' });
    const outcome = await relocateDossierAssetAfterCommit(100, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'moved');
    assert.equal(getKey(), 'dossiers/DEM-REF/M7-delivrance/certificates/uuid-5.pdf');
  });

  it('STORAGE-3 defense-in-depth: a server-generated asset (uploadedFromApp "api") is never relocated, even if mistakenly called', async () => {
    write(root, 'generated/certificates/uuid-6.pdf', 'generated-original');
    const { deps: d, getKey } = deps({ initialKey: 'staging/2026/09/29/uuid-6.pdf', uploadedFromApp: 'api' });
    const outcome = await relocateDossierAssetAfterCommit(103, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'skipped_server_generated');
    assert.equal(getKey(), 'staging/2026/09/29/uuid-6.pdf');
  });

  it('a concurrent relocation losing the optimistic update reports skipped_stale, not an error', async () => {
    write(root, 'staging/2026/09/29/uuid-6.pdf', 'race');
    const { deps: d } = deps({
      initialKey: 'staging/2026/09/29/uuid-6.pdf',
      casStorageKey: async () => false,
    });
    const outcome = await relocateDossierAssetAfterCommit(101, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'skipped_stale');
  });

  it('never throws, even when loadAsset itself rejects', async () => {
    const { deps: d } = deps({ loadAsset: async () => { throw new Error('DB_DOWN'); } });
    const outcome = await relocateDossierAssetAfterCommit(102, { ownerType: 'certificate_document', ownerId: 9 }, d);
    assert.equal(outcome.status, 'error');
    assert.equal(outcome.error, 'DB_DOWN');
  });
});
