import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAttachable,
  linkState,
  parseOptionalUploadAssetId,
  parseUploadAssetId,
  prepareUploadAttachment,
  versionValues,
  type AttachableAsset,
  type AttachActor,
} from './upload-attachment.js';

const applicant: AttachActor = { kind: 'applicant', applicantId: 7 };
const staff: AttachActor = { kind: 'staff', userId: 3 };

function asset(overrides: Partial<AttachableAsset> = {}): AttachableAsset {
  return {
    id: 41,
    fileUrl: '/api/files/41',
    storageKey: '2026/09/29/portal/misc/a.pdf',
    originalName: 'a.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1200,
    uploadedByUserId: null,
    uploadedByApplicantId: 7,
    uploadedFromApp: 'portal',
    linkedOwnerType: null,
    linkedOwnerId: null,
    orphanedAt: null,
    ...overrides,
  };
}

const staffAsset = (overrides: Partial<AttachableAsset> = {}) =>
  asset({ uploadedByUserId: 3, uploadedByApplicantId: null, uploadedFromApp: 'admin', ...overrides });

function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return 'accepted';
}

describe('parseUploadAssetId', () => {
  it('accepts a positive integer, also sent as a string', () => {
    assert.equal(parseUploadAssetId(41), 41);
    assert.equal(parseUploadAssetId('41'), 41);
  });

  it('requires a value', () => {
    for (const value of [undefined, null, '']) {
      assert.equal(refusal(() => parseUploadAssetId(value)), 'UPLOAD_ASSET_REQUIRED', String(value));
    }
  });

  it('refuses anything that is not a positive integer id', () => {
    for (const value of [0, -1, 1.5, 'abc', '12abc', {}, [], true]) {
      assert.equal(refusal(() => parseUploadAssetId(value)), 'UPLOAD_ASSET_ID_INVALID', String(value));
    }
  });

  it('optional variant: absent means no file, present must still be valid', () => {
    assert.equal(parseOptionalUploadAssetId(undefined), undefined);
    assert.equal(parseOptionalUploadAssetId(null), undefined);
    assert.equal(parseOptionalUploadAssetId(''), undefined);
    assert.equal(parseOptionalUploadAssetId('9'), 9);
    assert.equal(refusal(() => parseOptionalUploadAssetId('x')), 'UPLOAD_ASSET_ID_INVALID');
  });
});

describe('assertAttachable', () => {
  it('lets an applicant attach their own upload', () => {
    assert.equal(refusal(() => assertAttachable(asset(), applicant)), 'accepted');
  });

  it('lets a staff member attach their own upload', () => {
    assert.equal(refusal(() => assertAttachable(staffAsset(), staff)), 'accepted');
  });

  it('refuses a missing asset', () => {
    assert.equal(refusal(() => assertAttachable(undefined, applicant)), 'UPLOAD_ASSET_NOT_FOUND');
  });

  it("refuses another applicant's upload", () => {
    assert.equal(refusal(() => assertAttachable(asset({ uploadedByApplicantId: 8 }), applicant)), 'UPLOAD_ASSET_NOT_OWNED');
  });

  it("refuses another staff member's upload - SU included", () => {
    assert.equal(refusal(() => assertAttachable(staffAsset({ uploadedByUserId: 4 }), staff)), 'UPLOAD_ASSET_NOT_OWNED');
  });

  it('refuses a staff upload to an applicant and an applicant upload to staff', () => {
    assert.equal(refusal(() => assertAttachable(staffAsset({ uploadedByUserId: 7 }), applicant)), 'UPLOAD_ASSET_INVALID_SOURCE');
    assert.equal(refusal(() => assertAttachable(asset({ uploadedByApplicantId: 3 }), staff)), 'UPLOAD_ASSET_INVALID_SOURCE');
  });

  it('refuses a server-generated asset even to the user recorded on it', () => {
    assert.equal(
      refusal(() => assertAttachable(staffAsset({ uploadedFromApp: 'api' }), staff)),
      'UPLOAD_ASSET_INVALID_SOURCE'
    );
  });

  it('refuses an asset with no uploader at all', () => {
    assert.equal(
      refusal(() => assertAttachable(asset({ uploadedByApplicantId: null }), applicant)),
      'UPLOAD_ASSET_INVALID_SOURCE'
    );
  });

  it('refuses an orphan-marked asset', () => {
    assert.equal(refusal(() => assertAttachable(asset({ orphanedAt: new Date() }), applicant)), 'UPLOAD_ASSET_ORPHANED');
  });

  it('checks ownership before revealing link or orphan state', () => {
    assert.equal(
      refusal(() => assertAttachable(asset({ uploadedByApplicantId: 8, orphanedAt: new Date() }), applicant)),
      'UPLOAD_ASSET_NOT_OWNED'
    );
  });

  it('refuses a type the owner does not accept', () => {
    assert.equal(
      refusal(() => assertAttachable(asset({ mimeType: 'image/png' }), applicant, { acceptedMimeTypes: ['application/pdf'] })),
      'UPLOAD_ASSET_INVALID_OWNER'
    );
    assert.equal(
      refusal(() => assertAttachable(asset(), applicant, { acceptedMimeTypes: ['application/pdf'] })),
      'accepted'
    );
  });
});

describe('linkState', () => {
  const target = { ownerType: 'payment_proof', ownerId: 5 } as const;

  it('distinguishes unlinked, linked here and linked elsewhere', () => {
    assert.equal(linkState(asset(), target), 'unlinked');
    assert.equal(linkState(asset({ linkedOwnerType: 'payment_proof', linkedOwnerId: 5 }), target), 'here');
    assert.equal(linkState(asset({ linkedOwnerType: 'payment_proof', linkedOwnerId: 6 }), target), 'elsewhere');
    assert.equal(linkState(asset({ linkedOwnerType: 'payment_invoice', linkedOwnerId: 5 }), target), 'elsewhere');
  });
});

describe('prepareUploadAttachment', () => {
  const deps = (found: AttachableAsset | undefined, fileExists = true) => ({
    loadAsset: async () => found,
    fileExists: () => fileExists,
  });

  it('returns what the server derives from the asset', async () => {
    const prepared = await prepareUploadAttachment(41, applicant, {}, deps(asset()));
    assert.deepEqual(prepared, {
      assetId: 41,
      fileUrl: '/api/files/41',
      mimeType: 'application/pdf',
      originalName: 'a.pdf',
      sizeBytes: 1200,
      uploadedByUserId: null,
      actor: applicant,
    });
  });

  it('refuses when the physical file is gone', async () => {
    await assert.rejects(prepareUploadAttachment(41, applicant, {}, deps(asset(), false)), { message: 'UPLOAD_FILE_MISSING' });
  });

  it('runs the ownership rules before touching the disk', async () => {
    let statted = false;
    await assert.rejects(
      prepareUploadAttachment(41, applicant, {}, {
        loadAsset: async () => asset({ uploadedByApplicantId: 8 }),
        fileExists: () => ((statted = true), true),
      }),
      { message: 'UPLOAD_ASSET_NOT_OWNED' }
    );
    assert.equal(statted, false);
  });
});

describe('versionValues', () => {
  it('takes url, type and uploader from the asset - null uploader for an applicant upload', async () => {
    const prepared = await prepareUploadAttachment(41, applicant, {}, { loadAsset: async () => asset(), fileExists: () => true });
    assert.deepEqual(versionValues(prepared, 'payment_proof', 5), {
      ownerType: 'payment_proof',
      ownerId: 5,
      fileUrl: '/api/files/41',
      mimeType: 'application/pdf',
      uploadedBy: null,
      isCurrent: true,
    });
  });

  it('records the staff uploader', async () => {
    const prepared = await prepareUploadAttachment(41, staff, {}, { loadAsset: async () => staffAsset(), fileExists: () => true });
    assert.equal(versionValues(prepared, 'payment_invoice', 5).uploadedBy, 3);
  });
});
