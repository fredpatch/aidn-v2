# SESSION1-MEET-2 — Retour du compte rendu signé par le postulant

**Date**: 2026-10-15 · **Status**: design approved (D1–D6), spec approved with corrections (one activity label, M6 DB check); amended before push (§14: one signed upload only, workflow and dashboard visibility)
**Depends on**: SESSION1-MEET-1 (`2721c0c`) — not redesigned here.

## 1. Goal

DN Session 1 workflow:

1. The DN holds the M3/M4 meeting.
2. The DN uploads the compte rendu (CR).
3. The applicant consults or downloads the CR.
4. The applicant signs it outside AIDN.
5. The applicant uploads the signed copy.
6. The DN consults the signed copy.
7. Both versions stay traceable.

MEET-2 adds documentary traceability only. Out of scope:

- a DN validation, approval or rejection of the signed copy;
- an applicant dispute or comment;
- notifications or e-mail;
- a cockpit metric;
- SESSION1-UX-1.

## 2. Frozen rules

| Situation | Applicant | DN (`dn_agent`, `dn_supervisor`, `SU`) |
|---|---|---|
| M3/M4, dossier open, `held`, no DN CR | sees "pas encore disponible", no upload | uploads the CR |
| M3/M4, dossier open, `held`, DN CR present, no signed copy | consults/downloads the CR, **uploads** the signed copy | consults, **replaces** the CR |
| M3/M4, dossier open, `held`, DN CR + signed copy | consults both; **no** second upload (D3 revised, §14) | consults both; CR replacement **frozen** (D2) |
| Dossier closed | read only | read only |
| M6 `site_visit` | no DN CR, no signed copy | no DN CR (D1, now enforced by the API) |

- **Phase closure is unchanged.** M3/M4 can be closed without a DN CR and without a signed copy. `closePhase` gains no new gate.
- **Exceptional corrections.** Correcting a DN CR after a signed return is handled manually, outside the workflow, until a real rectification mechanism is validated. No recovery route or action is built, and the UI does not promise one.

## 3. Data model (Option A, D4)

### 3.1 New columns on `meetings`

```
signed_cr_document_url  text       NULL
signed_cr_uploaded_at   timestamp  NULL
```

Check constraint `meetings_signed_cr_coherent_chk`:

```sql
(signed_cr_document_url IS NULL) = (signed_cr_uploaded_at IS NULL)
AND (signed_cr_document_url IS NULL OR cr_document_url IS NOT NULL)
AND (signed_cr_document_url IS NULL OR meeting_type IN ('preliminary', 'formal'))
```

The third condition makes it physically impossible for an M6 meeting to hold a signed CR, even if a service bypasses `acceptsMeetingReport`. `status = 'held'` is deliberately left out of the check: the meeting lifecycle stays a service-level workflow rule, not a document-schema rule.

`cr_document_url` / `cr_uploaded_at` stay the authoritative DN original.

### 3.2 Owner chains

New value in `document_owner_type`: `meeting_report_signed`.

| Chain | `ownerType` | `ownerId` | Current file |
|---|---|---|---|
| DN original | `meeting_report` (unchanged) | meetingId | `meetings.cr_document_url` |
| Applicant signed copy | `meeting_report_signed` | meetingId | `meetings.signed_cr_document_url` |

The chains are independent by construction:

- `trashCurrentVersions` and `linkLockedAsset` filter on both owner type and owner id.
- Each service passes only its own owner-type literal.

The precedent is `payment_invoice` / `payment_proof`: two chains that share the `payments` id.

## 4. Policy helper

In `apps/api/src/modules/meetings/meeting-confirmation.ts`:

```ts
/** SESSION1-MEET-2 - M3/M4 have a DN compte-rendu and its signed return; M6 has neither (K6). */
export function acceptsMeetingReport(meetingType: MeetingType): boolean  // preliminary | formal
```

It is used by two places:

- the DN upload (`attachMeetingReport`, D1);
- the applicant signed-copy upload.

For M6, both answer `409 MEETING_REPORT_NOT_APPLICABLE`.

## 5. API

### 5.1 DN upload — `POST /api/meetings/:id/report` (changed)

The existing order is unchanged:

1. dossier open;
2. meeting `FOR UPDATE`;
3. claim the asset; replay = no-op.

Two checks are added after the claim, before the `held` check:

- `!acceptsMeetingReport(meeting.meetingType)` → `MEETING_REPORT_NOT_APPLICABLE` (409).
- `meeting.signedCrDocumentUrl !== null` → `MEETING_REPORT_FROZEN_SIGNED` (409).

The freeze is checked under the meeting row lock, so it is transactional against a concurrent applicant upload.

### 5.2 Applicant upload — `POST /api/meetings/:id/signed-report` (new)

- **Middleware:** `authenticateApplicant` only.
- **Body:** `z.object({ uploadAssetId }).strict()`; an unknown key is a 400 `VALIDATION_ERROR`.
- **Applicant id:** comes from the token only.

Controller:

```
prepareUploadAttachment(parseUploadAssetId(id), { kind: 'applicant', applicantId })
```

This enforces the uploader, the asset not being orphaned and the file existing. The accepted file types are the same as the DN CR (D6: no `acceptedMimeTypes` restriction).

Service `submitSignedMeetingReport(meetingId, applicantId, attachment)` in the new `meeting-signed-report.service.ts`. Inside one transaction:

1. `lockOwnedMeeting(tx, meetingId, applicantId)`. This is MEET-1's helper, today private to `meeting-negotiation.service.ts`; it moves unchanged to `meeting-write.ts` and is exported for reuse. It checks ownership first, then calls `lockMeeting`, which checks the dossier is open and locks the dossier and the meeting. Another applicant gets a 404 `MEETING_NOT_FOUND` before any state, including a closed dossier, leaks.
2. `claimUploadAsset(tx, attachment, target)`. If the result is `attached_here`, return the current view: no version, no audit (replay).
3. Run the guards:
   - `acceptsMeetingReport` → else `MEETING_REPORT_NOT_APPLICABLE`;
   - `status === 'held'` → else `MEETING_NOT_HELD`;
   - `crDocumentUrl !== null` → else `MEETING_REPORT_MISSING`.
4. `signedCrDocumentUrl !== null` → `MEETING_SIGNED_REPORT_ALREADY_SUBMITTED` (409, §14). The first copy is never trashed.
5. `trashCurrentVersions(tx, 'meeting_report_signed', meetingId)`.
6. Insert the version from `versionValues(attachment, 'meeting_report_signed', meetingId)`.
7. `linkLockedAsset(tx, attachment.assetId, target)`.
8. Update `signed_cr_document_url` and `signed_cr_uploaded_at = now()`.
9. Call `logAudit({ applicantId, action: 'MEETING_SIGNED_REPORT_SUBMITTED', module: phaseCodeOf, entityId: meetingId }, tx)` - no details (§14).

After commit: `relocateDossierAssetAfterCommit(assetId, target)`.

- **Response:** `200 ApplicantMeetingView`.
- **Errors:**
  - 404 `MEETING_NOT_FOUND`;
  - 409 `DOSSIER_CLOSED`, `MEETING_NOT_HELD`, `MEETING_REPORT_MISSING`, `MEETING_REPORT_NOT_APPLICABLE`;
  - existing `UPLOAD_ASSET_*` errors.
- **French messages:** in `error.ts` / `handleMeetingsError`.

### 5.3 Read models

- **`MeetingView`, bundle meeting (both audiences) and the DN list:** add `signedCrDocumentUrl` and `signedCrUploadedAt`.
- **`ApplicantMeetingView` whitelist:** add both fields, plus `canSubmitSignedReport: boolean`. It is computed server-side: M3/M4, `held`, DN CR present and dossier open.
- **Mutating routes:** none of them change their responses except the two above.

## 6. Files and storage

- **`uploads.types.ts`:** add `meeting_report_signed` to `UPLOAD_OWNER_TYPES`.
- **`file-context.ts`:**
  - add it to `PhaseOwnedType` and `PHASE_OWNED`;
  - map it to `schema.meetings` in `findOwnerPhaseId`.
  - The stage is then the meeting's phase (`M3` / `M4`). `file-access.policy` therefore gives:
    - the owning applicant: allowed;
    - other applicants: denied;
    - `dn_agent` / `dn_supervisor`: allowed;
    - `SU`: allowed;
    - Agent CI / Finance / reception: denied.
  - No policy change is needed. A test pins that an unmapped type would resolve to `unresolvable` (fail-closed).
- **`storage-context.ts`:**
  - add it to `RELOCATABLE_OWNER_TYPES_LIST`;
  - new case reusing `deps.meetingReport`, giving `dossiers/<reference>/<M3|M4 folder>/meeting-reports-signed/<uuid>`;
  - the phase folder comes from the meeting's phase, never a default.
- **`address-rewrite.ts`:** add a row `{ table: 'meetings', column: 'signed_cr_document_url', ownerTypeSql: "'meeting_report_signed'", ownerIdSql: 'id', mimeSql: null }`.
- **`dev-tools.service.ts`:** add the type to its owner lists.
- **Orphan cleanup:** unaffected, since only unlinked assets are cleaned.

## 7. Audit

| Action | Actor | `audit-request.ts` | Activity label |
|---|---|---|---|
| `MEETING_REPORT_ATTACHED` (unchanged) | user | `meeting` | Compte-rendu de réunion joint |
| `MEETING_SIGNED_REPORT_SUBMITTED` | applicant | `meeting` | Compte rendu signé transmis par le postulant |

One label, one event per meeting (a replacement no longer exists, §14). `activityLabel()` maps action and module only, and is not extended for this task.

`document_versions` holds the file history; the audit log holds the business events. Applicant versions keep `uploaded_by = null` (FK to `users`). The applicant identity is on `upload_assets.uploaded_by_applicant_id` and in the audit entry.

## 8. Portal UX

A new `components/meetings/MeetingReportPanel.tsx` is rendered for held M3/M4 meetings:

- in the M3 and M4 phase sections, where `MeetingDetails` is used;
- in « Mes réunions » history items.

It replaces the weak "Consulter le compte-rendu" / "compte-rendu" text links. Actions are visible buttons.

| State | Content |
|---|---|
| No DN CR | **Compte rendu de réunion** — « Le compte rendu n'est pas encore disponible. » |
| DN CR, no signed copy | **Compte rendu transmis par la DN** · déposé le {date} · [Consulter le compte rendu] [Télécharger] · « Après signature, téléversez le compte rendu signé. » · [Déposer le compte rendu signé] |
| Signed copy sent | Original block as above, then **Compte rendu signé transmis** · le {date à heure} · [Consulter] [Télécharger] · « Pour toute correction, contactez la Direction de la Navigabilité. » (no replacement, §14) |
| Dossier closed | Same documents, no upload button |

- **Upload flow:** the existing `lib/uploads.ts` helper (`POST /api/uploads`), then `POST /meetings/:id/signed-report`. The `meetings` and `requests` queries are invalidated afterwards.
- **Button visibility:** driven by `canSubmitSignedReport` from the server.

## 9. Admin UX

A new shared `components/meetings/MeetingReportRows.tsx` is used in:

- the preliminary `MeetingCard`;
- `FormalMeetingCard`;
- the Réunions detail.

It replaces the current inline CR block and shows two separated rows.

**Row 1 — Compte rendu DN.**

- Badge: « Non déposé » or « Disponible ».
- Actions:
  - [Consulter] opens the `DocumentViewer`;
  - [Télécharger];
  - [Déposer] or [Remplacer] while the dossier is open and no signed copy exists.
- After a signed return, show instead of the action:
  > Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant.

**Row 2 — Compte rendu signé par le postulant.** Shown only once the DN CR exists.

- Badge: « En attente du postulant » (neutral) or « Reçu le {date} » (success tone, not an alert).
- Actions once received: [Consulter] [Télécharger].
- No accept, reject or validate action.

The row is not shown for M6. There is no new cockpit metric (D5), and K6's `lacksMeetingReport` is unchanged.

## 10. Migration — `0010_session1_meet2_signed_report.sql`

```sql
ALTER TYPE "public"."document_owner_type" ADD VALUE 'meeting_report_signed';
ALTER TABLE "meetings" ADD COLUMN "signed_cr_document_url" text;
ALTER TABLE "meetings" ADD COLUMN "signed_cr_uploaded_at" timestamp;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_signed_cr_coherent_chk" CHECK (...);
```

- **No 55P04 risk.** No statement uses the new value, so this is safe inside Drizzle's single transaction (gotcha #23).
- **Guard test:** `meetings.migrations.test.ts` checks that the value is added by `0010` only, with no `INSERT|UPDATE|DELETE`.
- **No backfill.** Existing rows have null signed fields and satisfy the check.
- **Replay** on:
  - a clean DB;
  - a DB at `0009` holding meetings with and without a CR and with trashed CR versions.
- **Checks:** `db:check:committed` / `db:check:replayable`.
- **Deploy:** `npm run db:migrate` only.

## 11. Concurrency and idempotency

| Case | Outcome |
|---|---|
| Same asset submitted twice | `attached_here` → current view, no new version/audit |
| Asset linked to another owner | `UPLOAD_ASSET_ALREADY_LINKED` |
| Asset of another applicant / orphaned | `UPLOAD_ASSET_NOT_OWNED` / `UPLOAD_ASSET_ORPHANED` |
| Two different signed uploads | Serialized on meeting `FOR UPDATE`; the second gets `MEETING_SIGNED_REPORT_ALREADY_SUBMITTED`, the first stays current (§14) |
| DN replaces CR while the applicant signs | Same row lock. DN first → applicant signs the new CR; applicant first → DN gets `MEETING_REPORT_FROZEN_SIGNED` |
| Dossier closes during upload | Dossier `FOR SHARE` blocks closure until commit, or upload sees `DOSSIER_CLOSED` |

## 12. Tests

**API DB tests** (`meeting-signed-report.db.test.ts`):

- **DN original:**
  - requires `held`;
  - refused on M6;
  - replace works before a signed copy;
  - `MEETING_REPORT_FROZEN_SIGNED` after one.
- **Signed copy:**
  - happy path on M3 and M4;
  - no DN CR → refused;
  - not held → refused;
  - M6 → refused;
  - closed dossier → refused;
  - other applicant → 404;
  - foreign or orphaned asset → refused;
  - replay is idempotent;
  - a second, different file is refused (409); the first copy and its version stay current, nothing is trashed (§14).
- **Cross-chain:**
  - after the signed upload, the DN CR is still current and accessible;
  - each chain's trash leaves the other untouched;
  - both histories are listed per owner type.
- **Check constraint:** rejects a signed copy without its upload date, without a DN CR, or on an M6 meeting (raw SQL insert, bypassing the service).

**Unit tests:**

- `file-context` / `file-access.policy`:
  - owner applicant allowed, other applicant denied;
  - each DN role and SU allowed, Agent CI / Finance denied.
- `storage-context`: M3/M4 paths.
- Strict body.
- Audit mapping and label.
- HTTP-level strict body: an unknown key (e.g. `applicantId`) is a 400 `VALIDATION_ERROR` (§14).
- `acceptsMeetingReport`.

**Route tests:**

- route inventory;
- closed-dossier matrix (`dossier-open.routes.test.ts`);
- the static test that applicant routes take no ids from the body.

**UI tests:**

- **Portal:**
  - no CR / CR available / signed sent / closed;
  - French wording;
  - visible buttons.
- **Admin:**
  - Non déposé / Disponible + En attente / Reçu with replacement frozen;
  - no validation action;
  - no row on M6.

**Regression:**

- MEET-1 negotiation suites;
- `closePhase` succeeds with no CR and no signed copy;
- M6 site-inspection;
- invitation PDF.

## 13. Implementation slices

1. Migration `0010`, schema, `acceptsMeetingReport`, migration guard test.
2. Owner-type wiring: upload types, file context, storage context, address rewrite, dev-tools, plus their tests.
3. DN upload: M6 guard and freeze rule, plus tests.
4. Applicant service, controller and route, with audit, labels and error messages, plus DB and route tests.
5. Read models: `MeetingView`, applicant view (`canSubmitSignedReport`), bundles, list.
6. Portal `MeetingReportPanel` and its integration.
7. Admin `MeetingReportRows` in the M3/M4 cards and the Réunions detail.
8. Cache docs (decision #18, changelog, current-task) and full validation; commit after validation.

## 14. Pre-push amendment (2026-10-15)

Decided after the first implementation, before any push. It supersedes D3 and the replacement wording above.

### 14.1 One signed upload only (D3 revised)

- The applicant uploads the signed CR **once**. With `signedCrDocumentUrl` already set, another (different) file is refused: 409 `MEETING_SIGNED_REPORT_ALREADY_SUBMITTED`, « Un compte rendu signé a déjà été transmis. Pour toute correction, contactez la Direction de la Navigabilité. ». Nothing is trashed or replaced; a replay of the same upload asset stays an idempotent no-op.
- `canApplicantSubmitSignedReport` additionally requires no signed copy, so `canSubmitSignedReport` drops to false right after the upload.
- Portal: no « Remplacer le fichier signé »; the applicant keeps consult / download of both files and reads « Pour toute correction, contactez la Direction de la Navigabilité. ».
- Audit: one `MEETING_SIGNED_REPORT_SUBMITTED` per meeting, without `details`.
- Unchanged: DN CR frozen once a signed copy exists, `document_versions` chain, phase closure independent of both files, no DN validation, M6 excluded. A correction / replacement-request workflow is a separate future task.

### 14.2 Strict body over HTTP

`meeting-signed-report.http.test.ts` mounts the meetings router behind `express.json` + `cookie-parser` and proves that `{ uploadAssetId, applicantId }` (or any other extra key) is a 400 `VALIDATION_ERROR`; the applicant identity comes only from the authentication cookie.

### 14.3 Workflow and dashboard visibility (portal, from `canSubmitSignedReport` only)

- **M3 / M4 phase summary**: « Action requise — Compte rendu à signer » / « Le compte rendu de votre réunion est disponible. Consultez-le, signez-le puis déposez la version signée. », with a link « Accéder au compte rendu » to the report panel (`#compte-rendu-<meetingId>`).
- **Priority in the phase summary**: the applicant actions that hold the phase back stay first (M3: the declaration to return, which gates the closure; M4: the letter to deposit and the missing pieces). Then the signed CR, which outranks every passive wording - « clôturée » included. Rendez-vous states cannot coexist with it (it needs a held meeting).
- **Dossier banner**: the open phase's own action first; then a signed CR awaited on any phase, a closed one included; then the open phase's passive wording.
- **Closed phase**: the API accepts the signed copy while the dossier is open, even after the M3 / M4 phase closed. Such a closed-phase row opens by default and its report panel offers the upload, driven by the API flag - a deliberate exception to "closed phase rows are read-only".
- **Dashboard**: `ReportsToSignBanner` (same pattern as `MeetingsToConfirmBanner`) when at least one meeting of `/meetings/mine` has `canSubmitSignedReport`: « Compte rendu à signer » / « Un compte rendu de réunion est disponible et doit être retourné signé. », CTA « Voir le dossier » to `/dossiers/<requestId>#compte-rendu-<meetingId>`; several meetings show a count and one link each. It disappears on the refetch that follows the upload. In-app only, no e-mail.
