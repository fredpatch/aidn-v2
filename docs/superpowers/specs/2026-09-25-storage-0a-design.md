# STORAGE-0A: secure file delivery (design)

Status: approved with amendments (§15) and implemented. Date: 2026-09-25.

## 1. Outcome

When this slice ends, **every document the application can reach is served
through an authenticated, access-checked file endpoint**, and no stored
address depends on where the file sits on disk.

- Each file has a stable address, `/api/files/:uploadAssetId`. It is stored
  as text in the existing URL columns.
- The public `/uploads` route is closed, in Express and in nginx.
- Browsers open documents through short-lived signed links (5 minutes).
- Generated certificates and reports become `upload_assets` rows like every
  other file.

### Out of scope

| Item | Where it goes |
|---|---|
| Business endpoints accepting `uploadAssetId` only; checking who uploaded the file; no client-supplied `fileUrl` or `mimeType`; deleting rejected uploads; `UPLOADS_ROOT` in the attachment path | STORAGE-0B |
| Foreign keys from business tables to `upload_assets` | FILE-REFS-1 |
| Staging folder, dossier tree, moving files | STORAGE-1 and STORAGE-2 |
| Moving generated files to `generated/` and templates to `reference/` | STORAGE-3 (0A only registers them) |
| Moving existing files on disk | STORAGE-4 |
| Backup and restore of the database and uploads | INFRA-BACKUP-1 (the address rewrite in section 9 also needs a verified backup before it runs on staging) |
| `GET /api/meetings/:id` and `/:id/ticket` are readable by any logged-in user | MEETINGS-IDOR, a separate security task |
| Organisation-wide applicant access | M13 |
| Limiting R3 access to the assigned inspection | Not planned |

## 2. Current state (verified in the code)

**Public serving**
- `server.ts` serves every file publicly: `app.use('/uploads', express.static(UPLOADS_ROOT))`.
- `infra/nginx/staging.conf` forwards `/uploads/` on both server blocks.

**Where file addresses are stored**
- Addresses of the form `/uploads/<storageKey>` are held in 13 columns.

| Table.column | Owner it points to |
|---|---|
| `document_versions.file_url` | `(owner_type, owner_id)` |
| `upload_assets.file_url` | itself |
| `document_templates.file_url` | `document_template` |
| `formal_request_documents.file_url` | `formal_request_document` |
| `document_evaluations.resubmitted_file_url` | `formal_request_document` (through `formal_request_document_id`) |
| `preliminary_evaluation_forms.submitted_file_url` | `preliminary_evaluation_form` |
| `payments.invoice_file_url` / `proof_file_url` | `payment_invoice` / `payment_proof` |
| `meetings.cr_document_url` | `meeting_report` |
| `meetings.ticket_document_url` | only the analytics demo seed writes it; the app never reads it |
| `phases.closure_document_url` | `phase_closure_document` |
| `certificates.signed_file_url` | `certificate_document` |
| `reports.file_url` | generated report (no owner type yet) |

- One audit entry stores a file URL in its details (`CERTIFICATE_DOCUMENT_GENERATED`).

**Generated files**
- Certificates are written to `uploads/certificates/certificate-<ref>-<ms>.pdf`.
- Reports are written to `uploads/reports/<key>-<format>-<iso>.<ext>`.
- Both paths are resolved from `process.cwd()`.
- Neither kind has an `upload_assets` row.

**How the front end opens files**
- 23 front-end files render file addresses.
- They use plain `href` links, five identical portal `fileHref` helpers, and `DocumentViewer`, which renders an `<iframe>`.
- `DocumentViewer` picks the preview type from the URL extension.

**Sessions**
- Session cookies are httpOnly and SameSite=strict.
- Access tokens last 15 minutes for staff and 30 minutes for applicants.
- Staging serves admin (8200) and portal (8201) on one host. Browsers don't isolate cookies by port, so both cookies reach both apps.
- `authenticateEither` chooses the identity from the `Origin` header, and plain page loads don't send one.

**Server code that reads a disk path from a URL**
- `dev-tools.service.ts` (reset cleanup).
- `uploadFileExists`, used by the template list and the system status.
- `reports.controller.download`, which redirects to `report.fileUrl`.

**Portal visibility today**
- Applicants see invoices, their payment proofs, the formal letter, meeting reports, formal documents, their pre-evaluation declaration and document templates.
- Applicants never see phase-closure documents, generated certificate PDFs or signed certificate returns.

## 3. Stable address

- Format: `/api/files/<uploadAssetId>`, where the id is a positive integer.
- `@aidn/shared` exports two helpers:
  - `fileAddress(id: number): string` builds an address.
  - `parseFileAddress(value: string): number | null` reads one; any other string returns null.
- `upload_assets.file_url` also holds its own stable address. `upload_assets.storage_key` stays the only physical location, relative to `UPLOADS_ROOT`.
- An asset's address never changes. STORAGE-1 to STORAGE-4 can move the file by changing `storage_key` alone.

## 4. Who may open a file

### 4.1 Resolving the owner

`resolveAssetContext(asset)` returns one of the shapes below. It reads only what it needs, at most two joins.

| Asset | Context |
|---|---|
| Not linked | `{ kind: 'unlinked', uploadedByUserId, uploadedByApplicantId }` |
| `dg_circuit_document` | `{ kind: 'dossier', requestId, applicantId, stage: 'dg_circuit' }`, found through `dg_circuit_documents.request_id` |
| `formal_request_document`, `preliminary_evaluation_form`, `payment_invoice`, `payment_proof`, `meeting_report` | `{ kind: 'dossier', requestId, applicantId, stage: <phase_code> }`, found through the record's `phase_id`, then `phases` and `requests` |
| `phase_closure_document` | same shape; the owner id is the phase |
| `certificate_document` | `{ kind: 'dossier', requestId, applicantId, stage: 'M7' }`, found through `certificates.request_id` |
| `document_template` | `{ kind: 'template', active, isCurrent }`. `isCurrent` means the asset's address equals `document_templates.file_url` |
| `report` (new owner type) | `{ kind: 'report' }` |

Past versions have their own assets, linked to the same owner. They get the same context and therefore the same rule.

If the owner row is missing (deleted or inconsistent), or has no phase or request to resolve (for example a meeting without a phase), the context is `{ kind: 'unresolvable' }` and only SU may open the file.

### 4.2 Access rules

`canAccessFile(actor, context): boolean` is a pure function. The actor is
`{ kind: 'staff', userId, roles }` or `{ kind: 'applicant', applicantId }`.

1. SU (staff role `SU`): always allowed.
2. `unlinked`: allowed only for the uploader (the matching user id or applicant id).
3. `dossier`:
   - **Applicant:** allowed when `context.applicantId === actor.applicantId`, the applicant who submitted the request. Two exceptions stay staff-only: owner types `phase_closure_document` and `certificate_document`, because the portal never shows them today.
   - **Staff:** allowed when they hold a role for the stage.

     | Stage | Roles |
     |---|---|
     | `dg_circuit` (intake request and M4 formal letter) | reception, assistant_dg, dn_agent, dn_supervisor |
     | M3, M4 | dn_agent, dn_supervisor |
     | M5, M7 | dn_agent, dn_supervisor, s5_agent |
     | M6 | dn_agent, dn_supervisor, s5_agent, r3_agent |
4. `template`:
   - Current version while active: any logged-in staff member or applicant.
   - Past versions, or an inactive template: dn_agent, dn_supervisor.
5. `report`: dn_supervisor.
6. `unresolvable`: nobody except SU.

`POST /access` and `GET /api/files/:id` both call this one function.

## 5. Endpoints

All three live in a new `modules/files` module mounted at `/api/files`.

| Endpoint | Authentication | Purpose |
|---|---|---|
| `GET /api/files/:id` | staff or applicant session (`authenticateEither`) | Programmatic access and the stored address. Runs the access check, then streams the file (section 7). |
| `POST /api/files/:id/access` | staff or applicant session | Runs the access check. Returns `{ url, expiresAt, mimeType, originalName, sizeBytes }`, where `url` is `/api/files/:id/content?grant=<token>`. |
| `GET /api/files/:id/content?grant=` | the grant only, no cookie | Checks the grant (section 6), then streams the file. It does not check access again, because the grant was issued only after the check passed. |

**Errors**
- Unknown asset, access refused, or file missing on disk: **404**, `{ message: 'Fichier introuvable.' }`. A single answer, so nobody can find out which files exist.
- Grant missing, malformed, tampered with, expired or issued for another asset: **403**, `{ message: 'Lien expiré ou invalide.' }`. A single answer, with no reason given.
- A non-integer id: 404.

## 6. Signed grant

- **Payload:** `{ v: 1, a: <assetId>, e: <expiry, epoch seconds>, s: '<staff|applicant>:<id>' }`. It never contains `storage_key` or a path.
- **Token:** `base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payloadPart))`.
- **Secret:** a new `FILE_GRANT_SECRET` environment variable, used only for grants and never the JWT secrets.
  - Required when `NODE_ENV=production`.
  - In development, if it's missing, a random secret is generated at startup and a warning is logged. Grants then stop working after a restart.
  - Added to `.env.example` and `.env.staging.example`.
- **Lifetime:** 5 minutes (`FILE_GRANT_TTL_SECONDS = 300`, a constant).
- **Verification:**
  1. Split on `.`.
  2. Recompute the HMAC and compare with `crypto.timingSafeEqual`.
  3. Parse the JSON.
  4. Require `v === 1`.
  5. Require `a` to equal the `:id` in the path.
  6. Require `e > now`.

  Any failure gives the generic 403.
- `s` records who received the grant. It isn't used to authorize the download, which stays possible to share for up to 5 minutes (an accepted risk).
- **The token is never logged.**
  - Morgan currently logs `req.originalUrl`. Its format changes to log the path without the query string for `/api/files/*` routes.
  - Error logs in the files module never include the query string.
  - nginx: the `/api/files/` location gets its own `access_log` format without `$args`, or a format that logs `$uri` instead of `$request_uri`.

## 7. Streaming the file

- **Path:** resolve `storage_key` inside `UPLOADS_ROOT`, and refuse any key that would leave it.
- **Headers:**
  - `Content-Type`: `asset.mime_type`.
  - `Content-Length`: from `fs.stat`.
  - `Content-Disposition`: `inline` for `application/pdf` and `image/*`, `attachment` otherwise. `filename="<ASCII fallback>"; filename*=UTF-8''<percent-encoded originalName>`.
  - `Cache-Control: private, no-store`.
  - `X-Content-Type-Options: nosniff`.
- **Framing:** Helmet's `X-Frame-Options: SAMEORIGIN` stays, since the viewer iframe is same-origin (Vite proxy in development, nginx in staging).
- **Streaming:** use `fs.createReadStream` and destroy the stream on client abort.
- **Missing file:** if the file is gone from disk, return 404 (the same body as section 5).

## 8. Writes and server code

| Place | Change |
|---|---|
| `POST /api/uploads` | Insert the row, then set `file_url = /api/files/<id>` in the same transaction. Return that address. Clients that pass it back as `fileUrl` keep working, and the `expectedFileUrl` check still compares like with like. |
| Certificate generation | Register an asset (`uploaded_from_app 'api'`, `module_hint 'certificates'`, linked `certificate_document`) and store its address in `document_versions` and elsewhere. The file stays in `uploads/certificates/`, now resolved through `UPLOADS_ROOT`. |
| Report generation | Register an asset linked to the new owner type `report` and store its address in `reports.file_url`. The file stays in `uploads/reports/`. |
| `reports.controller.download` | Stream through the files service, since the route is already limited to dn_supervisor and SU. No more redirect. |
| Template seed (SEED-1B) | Store the stable address of the asset it creates. |
| `uploadFileExists` (template list, system status) | Replaced by `storedFileExists(address)`, which reads `/api/files/<id>` through the asset's `storage_key`. It also accepts legacy `/uploads/…` addresses during the transition. |
| `dev-tools.service` reset cleanup | Resolves files through the asset. |
| Database | A migration adds `report` to `document_owner_type`. |

## 9. Rewriting existing addresses

A script, `npm run storage:rewrite-addresses --workspace=apps/api`.
- **Dry-run by default.** `--apply` makes the changes.
- **Idempotent.** It can be run again safely.
- **Runs with the API stopped** during deployment, like `db:migrate`, so the orphan cleanup job can't race it.

**Plan (a pure function tested on its own).** For each row in the columns of section 2 whose value starts with `/uploads/`:
1. Take `storageKey` as the value without the `/uploads/` prefix.
2. **Find the asset.** Use the `upload_assets` row with that `storage_key` (the lowest id if there are several). If there is none, register one:
   - `original_name`: the file's base name.
   - `mime_type`: the row's MIME column when it has one, otherwise guessed from the extension.
   - `size_bytes`: from `fs.stat`, or 0 if the file is missing.
   - `uploaded_from_app 'api'`, `module_hint 'legacy'`.

   A missing file keeps an address, and the endpoint then answers 404. This preserves the "file missing" state the system status reports.
3. **Link the asset** to the owner the column implies (table in section 2), if it isn't linked yet.
   - This is required, not optional: an unlinked asset would be deleted by orphan cleanup.
   - It also repairs any existing referenced-but-unlinked asset.
   - An asset already linked to a **different** owner is reported and left unchanged. The row keeps its address; SU sorts it out.
4. **Rewrite the value** to `/api/files/<id>`, and rewrite every `upload_assets.file_url` to the row's own address.

**Left unchanged and reported**
- Values not starting with `/uploads/`.
- `meetings.ticket_document_url` (unused; a follow-up will drop the column).
- Audit log details (audit history stays as it was).

**Report:** per column, rows rewritten, assets registered, assets linked, conflicts and skipped values. The run happens in one transaction, and `--apply` without a clean dry-run is allowed but prints the plan first.

**Precondition on staging:** a verified backup of the database and the uploads volume (INFRA-BACKUP-1), or at minimum a manual `pg_dump` plus an archive of the volume, taken immediately before the run.

## 10. Closing public serving (rollout)

1. Deploy the code: the files module, the new write paths, the front end and the script. The `/uploads` static route still exists at this point.
2. The deploy script runs, in order: `db:migrate` (adds `report`), `storage:rewrite-addresses --apply`, then starts the API.
3. The same release removes `express.static('/uploads')` and the two nginx `/uploads/` locations. Steps 1 to 3 are one release: step 1 is the code, steps 2 and 3 are its deploy.
4. **Startup check:** the API counts remaining `/uploads/` values in the columns of section 2.
   - If any remain, it logs a warning naming the columns. It does not fail startup: those files are unreachable either way, and blocking startup would be worse.
   - « État du système » shows the same count as « Adresses de fichiers héritées ».
   - The count only includes values the script can rewrite: `meetings.ticket_document_url` and audit details are left out, so they don't warn forever.

After step 3, a leaked old `/uploads/...` URL returns 404 and a leaked `/api/files/:id` without a session returns 401.

## 11. Front end

**Shared helper:** `parseFileAddress` from `@aidn/shared`.

**Per app** (admin and portal each get a copy; there is no shared UI package):
- `lib/files.ts`: `requestFileAccess(address)` calls `POST /api/files/:id/access` through the axios client, so session renewal and the `Origin` header work as usual.
- `useFileAccess(address)`: requests a grant when asked and returns `{ open, url, mimeType, originalName, loading, error }`.
- `<FileLink address label download?>`:
  - On click, it requests a grant and opens it in a new tab, or downloads it with the original name.
  - It shows a small error toast (« Fichier introuvable ou accès refusé. ») on 404.
  - For a value that isn't a stable address (for example a leftover legacy value), it renders as unavailable instead of a dead link.
- `DocumentViewer`: when a file opens, it requests a grant and uses the grant URL for the iframe or image. It picks the preview type from `grant.mimeType`, no longer from the URL extension. If the grant has expired, it requests a new one on « Réessayer » and on reopen.

**Migration of call sites:** the 23 files listed in section 2 switch to `FileLink` or `DocumentViewer`. The five portal `fileHref` helpers and admin's `resolveViewerUrl` are deleted.

## 12. Tests

**Pure functions (node:test, API)**
- `canAccessFile`: the full matrix.
  - Each stage × each role.
  - Applicant owner or not.
  - The applicant exceptions (closure document, certificate).
  - Unlinked uploader or not.
  - Template current, past and inactive.
  - Report.
  - Unresolvable.
  - SU.
- Grants:
  - Round trip.
  - Expired, tampered payload, tampered signature, wrong asset id, malformed, wrong version.
  - Signed with a different secret.
  - Payload never contains the storage key.
- Header builder: disposition inline or attachment, UTF-8 file names with accents and quotes, the ASCII fallback, all security headers.
- The address-rewrite plan: registration, reuse, linking, repair of an unlinked asset, conflicts, missing file, skipped values, idempotence (running the plan on its own output changes nothing).
- `parseFileAddress` and `fileAddress`.
- `storedFileExists` with both address forms.

**Owner resolution:** tested per owner type against an injected store, the same pattern as the seeding tests.

**Front end:** assertion files for the grant-to-viewer mapping (preview type from MIME) and for `FileLink`'s handling of values that aren't stable addresses.

**Runtime checks (local development only)**
- A matrix of HTTP calls with locally signed sessions: staff roles, the owning applicant and another applicant.
- Expired and tampered grants return the generic 403.
- Headers are present.
- Morgan output contains no `grant=`.
- The script: a dry-run on a copy of the development data, then `--apply`, then a second run showing no changes.
- `/uploads/...` returns 404 after the route is closed.
- Viewing a PDF and an image in `DocumentViewer`, and downloading a DOCX from the portal.

## 13. Risks

- **The first run of the script is the main risk.**
  - Mitigations: dry-run, one transaction, idempotence, the backup precondition, and the count at startup and in the system status.
- **Front-end call sites missed.**
  - A missed site shows a legacy or stable address without `FileLink`, and a click without a session fails (401).
  - Mitigation: a grep check for `.fileUrl`, `FileUrl` and `href=` on file fields in both apps, listed in the implementation plan.
- **A shared signed link is usable for up to 5 minutes.** Accepted.
- **New secret in production.** A missing `FILE_GRANT_SECRET` stops the production API at startup, deliberately.
- **Thin controllers.** The three file endpoints are thin and are verified at runtime; the logic sits in the pure functions tested above.

## 14. Follow-ups this slice creates

- MEETINGS-IDOR: the meetings detail and ticket endpoints need an ownership check.
- Drop `meetings.ticket_document_url`, which the app doesn't use.
- FILE-REFS-1: replace the URL columns with foreign keys to `upload_assets`.

## 15. Approved amendments (2026-09-25)

**A1. Two valid sessions at once.**
- The files module never guesses who the caller is. The resolver `resolveFileActor(req)` follows these rules:
  - Only the staff session is valid: the caller is staff.
  - Only the applicant session is valid: the caller is the applicant.
  - Both are valid and the `Origin` header is `ADMIN_ORIGIN`: staff.
  - Both are valid and the `Origin` header is `PORTAL_ORIGIN`: applicant.
  - Both are valid and the identity can't be determined safely: **401**, `{ message: 'Session ambiguë : reconnectez-vous depuis l’application concernée.', code: 'AMBIGUOUS_SESSION' }`.
- Applies to `GET /api/files/:id` and `POST /api/files/:id/access`.
- `authenticateEither`, used by the rest of the app, is unchanged.

**A2. The delivery mode is part of the grant.**
- The payload becomes `{ v: 1, a, e, s, d }` with `d` equal to `'inline'` or `'attachment'`.
- `POST /access` accepts `{ disposition?: 'inline' | 'attachment' }`. The default is `inline`; any other value gives 400.
- `GET /content` takes `Content-Disposition` from the signed `d` only, never from a query parameter. Verification rejects an unknown `d`.
- The file name comes from the asset's metadata.
- Usage:
  - `DocumentViewer` and previewable `FileLink`s request `inline`.
  - Explicit download actions, and types that can't be previewed, request `attachment`.
- This replaces the rule in §7 that chose the disposition by MIME type.

**A3. Rollout order (staging and production).**
1. Take a verified backup of the database and the uploads volume.
2. Build the new release.
3. Stop the old API and its jobs.
4. Run `db:migrate`.
5. Run `storage:rewrite-addresses` as a dry-run.
6. Check that nothing unresolved is reported.
7. Run `storage:rewrite-addresses --apply`.
8. Start the new API, which no longer serves `/uploads`.
9. Run the health checks.
10. Reload nginx without the `/uploads` proxy.
11. Check representative files from admin and from the portal.

- The rewrite must never overlap with orphan cleanup, uploads or business changes, so it runs while the API is stopped.
- It is never run on staging or production without the backup.
- The staging deploy script refuses to run the rewrite unless `STORAGE_BACKUP_CONFIRMED=<backup id>` is set.
