# STORAGE-0B - Asset-only attachment contract

Status: implemented locally 2026-09-29 (not deployed). Follows STORAGE-0A
(`2026-09-25-storage-0a-design.md`).

## Problem found in planning

Most workflow screens never linked their upload: the portal sent no
`uploadAssetId` (M1, M3, M4) or `uploaded.id` (a field the upload response
does not have: M5/M6/M7 proofs, M5 resubmission, courrier returns); several
admin screens did the same (M3/M4 meeting reports and closures, M4 letter).
`linkUploadAssetToOwner` silently did nothing without an id, and the daily
orphan job (03:30) deletes the file of any unlinked upload older than
`upload_orphan_retention_days` (14). On staging, applicant documents older than
14 days may already be gone. Containment: D1 below.

## Contract

- Business endpoints take `{ uploadAssetId }` (closures:
  `closureDocumentUploadAssetId`, optional). `fileUrl`, `mimeType`,
  `closureDocumentUrl`, `closureDocumentMimeType` in a body are ignored.
- The server derives the address, MIME type and `document_versions.uploaded_by`
  (= `upload_assets.uploaded_by_user_id`, so null for an applicant upload) from
  the asset.
- `POST /api/uploads` returns `{ uploadAssetId, originalName, mimeType,
  sizeBytes }` (shared type `UploadedAsset`); `fileUrl` removed.

## Attachment service (`modules/uploads/upload-attachment.ts`)

1. `prepareUploadAttachment` (outside any transaction): asset exists; not
   server-generated (`uploaded_from_app='api'`); uploaded by this actor
   (applicant id / user id - SU included, D3); not orphan-marked; MIME accepted
   by the owner; file present on disk.
2. In the business transaction, **target row locked first**, then
   `claimUploadAsset` / `lockUploadAsset` (asset `FOR UPDATE`, rules re-checked):
   linked to the same target -> `attached_here` (idempotent 200, no write, D4);
   linked elsewhere -> 409; then the business writes, then `linkLockedAsset`
   (`UPDATE ... WHERE linked_owner_type IS NULL AND orphaned_at IS NULL`,
   exactly one row or rollback). Audit entries are written in the same
   transaction (`logAudit(params, tx)`).
3. `trashCurrentVersions(tx, ownerType, ownerId)` - always scoped by owner type.

`linkUploadAssetToOwner` is deleted. `linkOrRelinkUploadAsset` stays the SU-only
maintenance path (`POST /api/uploads/link`). A static test fails if a controller
reads a file address/MIME from the body or the old helper reappears.

## Errors

| Code | Status | Public |
|---|---|---|
| `UPLOAD_ASSET_REQUIRED` / `UPLOAD_ASSET_ID_INVALID` | 400 | own code |
| `UPLOAD_ASSET_NOT_FOUND` / `_NOT_OWNED` / `_INVALID_SOURCE` | 400 | one response, code `UPLOAD_ASSET_UNAVAILABLE` (D5) |
| `UPLOAD_ASSET_INVALID_OWNER` | 400 | own code |
| `UPLOAD_ASSET_ALREADY_LINKED` / `_ORPHANED` / `UPLOAD_FILE_MISSING` | 409 | own code |
| Upload refused: type / empty / too large | 400 / 400 / 413 | `UPLOAD_TYPE_NOT_ACCEPTED` / `UPLOAD_EMPTY` / `UPLOAD_TOO_LARGE` |

## Access changes

- M3 declaration submit: applicant only (D7).
- M4 letter: applicant, or DN/SU on the applicant's behalf (D7).
- M4 document slots: applicant only at the route (the service already was).
- M5 resubmission: the evaluation must belong to the applicant (D6).
- M5/M6/M7 proofs: the phase must belong to the request in the URL, and the
  request to the applicant; the phase must be of the endpoint's module (D6).
- Admin actions that could never work (staff proof, staff resubmission, staff
  M4 documents) removed (D10).

## Uploads and cleanup

- Multer `fileFilter` refuses other types before writing; Multer errors map to
  4xx; empty files and any failure before the asset row commits delete the file.
- Orphan cleanup claims each candidate in its own transaction
  (`FOR UPDATE SKIP LOCKED`, still unlinked, still stale), commits the mark,
  then deletes the file. Attachment refuses orphan-marked assets, so a file can
  never be deleted under an attachment.

## Link repair (0B-0)

`storage:rewrite-addresses` now also links assets that a stable address
references but that were never linked (`repairs`, flagged when already
orphan-marked), reports stable addresses with no asset (`dangling`), and never
relinks (conflict). It runs through the existing deploy step.

## Out of scope

Physical moves / folder layout (STORAGE-1/2), foreign keys to upload_assets
(FILE-REFS-1), content sniffing (FILE-CONTENT-VALIDATION), backups
(INFRA-BACKUP-1), MEETINGS-IDOR, organisation-wide applicant access.
