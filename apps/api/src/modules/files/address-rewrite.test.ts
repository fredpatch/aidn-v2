import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planAddressRewrite, type AddressRow, type ExistingAsset } from './address-rewrite.js';

const fileInfo = (existing: Record<string, number>) => (storageKey: string) =>
  storageKey in existing ? { exists: true, sizeBytes: existing[storageKey] } : { exists: false, sizeBytes: 0 };

function row(overrides: Partial<AddressRow>): AddressRow {
  return {
    table: 'formal_request_documents',
    column: 'file_url',
    rowId: 1,
    value: '/uploads/2026/09/25/portal/misc/a.pdf',
    ownerType: 'formal_request_document',
    ownerId: 11,
    mimeType: null,
    ...overrides,
  };
}

const asset = (overrides: Partial<ExistingAsset>): ExistingAsset => ({
  id: 183,
  storageKey: '2026/09/25/portal/misc/a.pdf',
  linkedOwnerType: 'formal_request_document',
  linkedOwnerId: 11,
  ...overrides,
});

describe('planAddressRewrite', () => {
  it('reuses the existing asset and rewrites the row to its stable address', () => {
    const plan = planAddressRewrite([row({})], [asset({})], fileInfo({}));
    assert.deepEqual(plan.registrations, []);
    assert.deepEqual(plan.links, []);
    assert.deepEqual(plan.rewrites, [
      { table: 'formal_request_documents', column: 'file_url', rowId: 1, from: '/uploads/2026/09/25/portal/misc/a.pdf', asset: { existingId: 183 } },
    ]);
  });

  it('reuses the lowest id when several assets share a storage key', () => {
    const plan = planAddressRewrite([row({})], [asset({ id: 190 }), asset({ id: 184 })], fileInfo({}));
    assert.deepEqual(plan.rewrites[0].asset, { existingId: 184 });
  });

  it('registers a missing asset once per storage key, linked to its owner, preserving a missing file', () => {
    const plan = planAddressRewrite(
      [
        row({ table: 'document_versions', rowId: 5, mimeType: 'application/pdf' }),
        row({ table: 'formal_request_documents', rowId: 1 }),
        row({ value: '/uploads/certificates/certificate-CERT-2026-0001-1.pdf', table: 'document_versions', rowId: 6, ownerType: 'certificate_document', ownerId: 70, mimeType: null }),
      ],
      [],
      fileInfo({ '2026/09/25/portal/misc/a.pdf': 2048 })
    );
    assert.deepEqual(plan.registrations, [
      {
        storageKey: '2026/09/25/portal/misc/a.pdf',
        originalName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        fileExists: true,
        ownerType: 'formal_request_document',
        ownerId: 11,
      },
      {
        storageKey: 'certificates/certificate-CERT-2026-0001-1.pdf',
        originalName: 'certificate-CERT-2026-0001-1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 0,
        fileExists: false,
        ownerType: 'certificate_document',
        ownerId: 70,
      },
    ]);
    assert.equal(plan.rewrites.length, 3);
    assert.deepEqual(plan.rewrites[1].asset, { registeredKey: '2026/09/25/portal/misc/a.pdf' });
  });

  it('guesses the MIME type from the extension when no row has one', () => {
    const plan = planAddressRewrite(
      [
        row({ value: '/uploads/x/doc.docx' }),
        row({ value: '/uploads/x/img.JPG', rowId: 2 }),
        row({ value: '/uploads/x/blob.bin', rowId: 3 }),
      ],
      [],
      fileInfo({})
    );
    assert.deepEqual(
      plan.registrations.map((r) => r.mimeType),
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'application/octet-stream']
    );
  });

  it('links a referenced but unlinked asset (repair, so orphan cleanup cannot delete it)', () => {
    const plan = planAddressRewrite([row({})], [asset({ linkedOwnerType: null, linkedOwnerId: null })], fileInfo({}));
    assert.deepEqual(plan.links, [{ assetId: 183, ownerType: 'formal_request_document', ownerId: 11 }]);
    assert.equal(plan.rewrites.length, 1);
  });

  it('never relinks an asset owned by something else: conflict, row left unchanged', () => {
    const plan = planAddressRewrite([row({})], [asset({ linkedOwnerType: 'payment_proof', linkedOwnerId: 99 })], fileInfo({}));
    assert.deepEqual(plan.links, []);
    assert.deepEqual(plan.rewrites, []);
    assert.deepEqual(plan.conflicts, [
      {
        table: 'formal_request_documents',
        column: 'file_url',
        rowId: 1,
        value: '/uploads/2026/09/25/portal/misc/a.pdf',
        assetId: 183,
        expectedOwner: 'formal_request_document:11',
        actualOwner: 'payment_proof:99',
      },
    ]);
  });

  it('treats two rows claiming one new file for different owners as a conflict for the second', () => {
    const plan = planAddressRewrite(
      [row({ rowId: 1 }), row({ table: 'payments', column: 'proof_file_url', rowId: 2, ownerType: 'payment_proof', ownerId: 99 })],
      [],
      fileInfo({})
    );
    assert.equal(plan.registrations.length, 1);
    assert.equal(plan.rewrites.length, 1);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].actualOwner, 'formal_request_document:11');
  });

  it('rewrites upload_assets.file_url to the asset’s own address without linking', () => {
    const plan = planAddressRewrite(
      [row({ table: 'upload_assets', column: 'file_url', rowId: 183, ownerType: null, ownerId: null })],
      [asset({ linkedOwnerType: null, linkedOwnerId: null })],
      fileInfo({})
    );
    assert.deepEqual(plan.links, []);
    assert.deepEqual(plan.rewrites[0].asset, { existingId: 183 });
  });

  it('skips values that are neither legacy nor stable addresses, and ignores stable ones', () => {
    const plan = planAddressRewrite(
      [row({ value: 'https://example.org/a.pdf', rowId: 1 }), row({ value: '/api/files/183', rowId: 2 }), row({ value: '/uploads/', rowId: 3 })],
      [asset({})],
      fileInfo({})
    );
    assert.deepEqual(plan.rewrites, []);
    assert.deepEqual(
      plan.skipped.map((s) => s.value),
      ['https://example.org/a.pdf', '/uploads/']
    );
  });

  it('is idempotent: planning again after applying changes nothing', () => {
    const plan = planAddressRewrite([row({ value: '/api/files/183' })], [asset({})], fileInfo({}));
    assert.deepEqual(
      { r: plan.registrations, l: plan.links, w: plan.rewrites, c: plan.conflicts, s: plan.skipped },
      { r: [], l: [], w: [], c: [], s: [] }
    );
  });
});

describe('planAddressRewrite - STORAGE-0B link repair of stable addresses', () => {
  const stable = (overrides: Partial<AddressRow>) => row({ value: '/api/files/183', ...overrides });

  it('links a referenced but unlinked asset to the owner its column implies', () => {
    const plan = planAddressRewrite(
      [stable({ table: 'document_versions', rowId: 5 }), stable({ table: 'formal_request_documents', rowId: 11 })],
      [asset({ linkedOwnerType: null, linkedOwnerId: null })],
      fileInfo({})
    );
    assert.deepEqual(plan.repairs, [
      { assetId: 183, ownerType: 'formal_request_document', ownerId: 11, wasOrphaned: false },
    ]);
    assert.deepEqual(plan.rewrites, []);
    assert.deepEqual(plan.conflicts, []);
  });

  it('flags a repaired asset that cleanup had already marked orphaned', () => {
    const plan = planAddressRewrite(
      [stable({})],
      [asset({ linkedOwnerType: null, linkedOwnerId: null, orphanedAt: new Date('2026-09-01') })],
      fileInfo({})
    );
    assert.equal(plan.repairs[0].wasOrphaned, true);
  });

  it('changes nothing when the asset is already linked to that owner', () => {
    const plan = planAddressRewrite([stable({})], [asset({})], fileInfo({}));
    assert.deepEqual(plan.repairs, []);
    assert.deepEqual(plan.conflicts, []);
  });

  it('reports a conflict and never relinks an asset owned by something else', () => {
    const plan = planAddressRewrite(
      [stable({})],
      [asset({ linkedOwnerType: 'payment_proof', linkedOwnerId: 4 })],
      fileInfo({})
    );
    assert.deepEqual(plan.repairs, []);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].assetId, 183);
    assert.equal(plan.conflicts[0].actualOwner, 'payment_proof:4');
    assert.equal(plan.conflicts[0].expectedOwner, 'formal_request_document:11');
  });

  it('reports a conflict when two rows imply different owners for one unlinked asset', () => {
    const plan = planAddressRewrite(
      [stable({ rowId: 1 }), stable({ table: 'payments', column: 'proof_file_url', rowId: 4, ownerType: 'payment_proof', ownerId: 4 })],
      [asset({ linkedOwnerType: null, linkedOwnerId: null })],
      fileInfo({})
    );
    assert.equal(plan.repairs.length, 1);
    assert.equal(plan.conflicts.length, 1);
  });

  it('reports an address whose asset does not exist, without blocking', () => {
    const plan = planAddressRewrite([stable({ value: '/api/files/999' })], [asset({})], fileInfo({}));
    assert.deepEqual(plan.dangling, [
      { table: 'formal_request_documents', column: 'file_url', rowId: 1, value: '/api/files/999' },
    ]);
    assert.deepEqual(plan.conflicts, []);
  });

  it('ignores the upload_assets row itself', () => {
    const plan = planAddressRewrite(
      [stable({ table: 'upload_assets', rowId: 183, ownerType: null, ownerId: null })],
      [asset({ linkedOwnerType: null, linkedOwnerId: null })],
      fileInfo({})
    );
    assert.deepEqual(plan.repairs, []);
  });
});
