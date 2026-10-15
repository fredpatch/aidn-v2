# SESSION1-MEET-2 — Signed meeting report return: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a held M3/M4 meeting, the applicant uploads the DN compte rendu (CR) back once signed, and the DN consults it. The signed copy has its own document chain; the DN CR is frozen once a signed copy exists.

**Architecture:** Two columns on `meetings` hold the current signed file, and a new owner type `meeting_report_signed` holds its version chain beside the DN's `meeting_report` chain (same `meetingId`, same pattern as `payment_invoice` / `payment_proof`). There is one applicant-only command route, `POST /api/meetings/:id/signed-report`. It reuses MEET-1's ownership lock, the STORAGE-0B attach steps and the K7 closed-dossier guard. A policy helper in `meeting-confirmation.ts` keeps M6 out of both report flows.

**Tech Stack:**
- API: Express, Drizzle 0.45, PostgreSQL, `node:test` via `tsx --test`.
- Front ends: React with Vite, vitest and Testing Library (admin and portal).

**Spec:** `docs/superpowers/specs/2026-10-15-session1-meet-2-design.md`. Read it with this plan.

## Global Constraints

- M3 (`preliminary`) and M4 (`formal`) only. M6 (`site_visit`) has no DN CR and no signed copy, and the API now enforces both (D1).
- **DN CR frozen** once a signed copy exists (D2). The admin wording is exactly: « Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant. » No recovery route or action. The UI never mentions SU or a correction procedure.
- **Applicant replacement:** the applicant may replace their signed file while the dossier is open (D3). The history stays in `document_versions`.
- **Data model** (Option A, D4):
  - columns `signed_cr_document_url`, `signed_cr_uploaded_at`;
  - owner types `meeting_report` (DN, unchanged) and `meeting_report_signed` (applicant).
- **Out of scope** (D5): notifications, e-mail, any new cockpit metric, any DN validation, accept or reject action, applicant comment or dispute.
- **File types:** the same as the DN CR, with no MIME restriction beyond the upload endpoint's (D6). Never hardcode a MEET-2-specific extension list in the front ends:
  - the portal reuses `DOCUMENT_ACCEPT` from `components/files/FileDropzone.tsx`;
  - admin sets no `accept` attribute, exactly like the existing M3/M4 card's CR input;
  - the backend (`ACCEPTED_DOCUMENT_MIME_TYPES`, upload endpoint) stays authoritative.
- **Phase closure is unchanged:** a phase closes without a DN CR and without a signed copy.
- **Closed dossier:** read only, so a signed-copy upload returns 409 `DOSSIER_CLOSED`.
- **Audit:** one action, `MEETING_SIGNED_REPORT_SUBMITTED`, with one label for both submission and replacement: « Compte rendu signé transmis par le postulant ». `details: { replaced: boolean }` is stored. `activityLabel()` is NOT extended.
- **DB check** `meetings_signed_cr_coherent_chk`:
  - the URL is set exactly when the timestamp is set;
  - a signed copy implies a DN CR;
  - a signed copy implies meeting type `preliminary` or `formal`.
  - `status = 'held'` stays out of the DB check (service rule).
- **No 55P04 risk:** migration `0010` adds the enum value and nothing in it uses the value. No backfill.
- **Applicant identity:** comes from the token only. Another applicant's meeting gets 404, decided before any dossier state is revealed.
- **Commits:** do not commit task by task. The user's rule is one commit after full validation (Task 8). Each task ends with its tests green.
- **Confirmation literals:** outside `modules/meetings/` and `shared/db/`, never compare confirmation literals (`meeting-confirmation.literals.test.ts`).
- **Commands:**
  - Run from the repo root: `npm run test --workspace=apps/api`, `npm run test --workspace=apps/admin`, `npm run test --workspace=apps/portal`, `npm run typecheck --workspaces --if-present`.
  - API DB tests need `DATABASE_URL` set to a migrated, disposable database. Without it they skip.
  - Run the API suite serially, as in MEET-1 (`--test-concurrency=1`).

## Review Focus

1. **Stale admin page:** the DN clicks « Remplacer le compte rendu » after the applicant's signed copy arrived. Expect a 409 `MEETING_REPORT_FROZEN_SIGNED` with the exact French sentence, no new version, and the error shown in the card. Pinned in Task 3 (DB) and Task 7 (UI).
2. **Attach refused after the file uploaded:** for example the dossier closed meanwhile. Expect the API message in an error toast, no success toast, the upload button usable again, and the asset left unlinked (orphan cleanup). Pinned in Task 6.
3. **Double click on « Déposer le compte rendu signé »:** a second request must not start while one is running. Pinned in Task 6.
4. **No panel for an unresolved meeting:** a `no_show` or `scheduled` M3 meeting shows no report panel at all in the portal. Pinned in Task 6.
5. **Closed dossier in « Mes réunions »:** the list item reports `canSubmitSignedReport: false`, even for a held meeting with a DN CR. Pinned in Task 5 (DB) and Task 6 (UI).

---

### Task 1: Migration 0010, schema columns and check, policy helpers

**Files:**
- Modify: `apps/api/src/shared/db/schema.ts` (enum `documentOwnerTypeEnum` ~line 166; table `meetings` ~line 432)
- Create (generated): `apps/api/drizzle/0010_session1_meet2_signed_report.sql`, `apps/api/drizzle/meta/0010_snapshot.json`; modify `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/modules/meetings/meeting-confirmation.ts`
- Create: `apps/api/src/modules/meetings/meeting-signed-report.migrations.test.ts`
- Modify: `apps/api/src/modules/meetings/meeting-confirmation.test.ts`

**Interfaces:**
- Produces:
  - schema columns `meetings.signedCrDocumentUrl: string | null` and `meetings.signedCrUploadedAt: Date | null` (so `MeetingRow` gains both);
  - enum value `'meeting_report_signed'`;
  - `acceptsMeetingReport(meetingType: string): boolean`;
  - `canApplicantSubmitSignedReport(meeting: { meetingType: string; status: string; crDocumentUrl: string | null }, dossierClosed: boolean): boolean`.

- [ ] **Step 1: Write the failing migration test**

Create `apps/api/src/modules/meetings/meeting-signed-report.migrations.test.ts`:

```ts
/** SESSION1-MEET-2 - migration 0010 shape. Drizzle applies every pending
 *  migration in ONE transaction: adding an enum value is safe only while no
 *  statement of the batch uses it (55P04, gotcha #23). 0010 adds the value
 *  and two nullable columns, and backfills nothing. No database needed. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const drizzleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
const FILE = '0010_session1_meet2_signed_report.sql';
const sql = fs.readFileSync(path.join(drizzleDir, FILE), 'utf8');

describe('migration 0010 (signed meeting report)', () => {
  it('adds the owner type value and writes no data', () => {
    assert.match(sql, /ALTER TYPE "public"\."document_owner_type" ADD VALUE 'meeting_report_signed'/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it('is the only migration mentioning the new owner type', () => {
    const using = fs
      .readdirSync(drizzleDir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => fs.readFileSync(path.join(drizzleDir, name), 'utf8').includes('meeting_report_signed'));
    assert.deepEqual(using, [FILE]);
  });

  it('adds both nullable columns, then the coherence check', () => {
    const url = sql.indexOf('ADD COLUMN "signed_cr_document_url" text');
    const at = sql.indexOf('ADD COLUMN "signed_cr_uploaded_at" timestamp');
    const check = sql.indexOf('ADD CONSTRAINT "meetings_signed_cr_coherent_chk"');
    assert.ok(url !== -1 && at !== -1 && check !== -1, 'columns and check present');
    assert.ok(url < check && at < check);
    assert.doesNotMatch(sql, /signed_cr_\w+" \w+ NOT NULL/);
  });

  it('the check ties the signed copy to a DN CR and to M3/M4, not to the meeting status', () => {
    const check = sql.slice(sql.indexOf('meetings_signed_cr_coherent_chk'));
    assert.match(check, /"cr_document_url" IS NOT NULL/);
    assert.match(check, /IN \('preliminary', 'formal'\)/);
    assert.doesNotMatch(check.split(';')[0], /held/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx tsx --test src/modules/meetings/meeting-signed-report.migrations.test.ts`
Expected: FAIL with `ENOENT ... 0010_session1_meet2_signed_report.sql`.

- [ ] **Step 3: Change the schema**

In `apps/api/src/shared/db/schema.ts`, add the value at the end of `documentOwnerTypeEnum`, so `ADD VALUE` needs no `BEFORE`:

```ts
  'report', // M12 - generated analytics report (STORAGE-0A asset registration)
  'meeting_report_signed', // SESSION1-MEET-2 - applicant's signed return of a meeting CR
]);
```

In the `meetings` table, add the columns right after `crUploadedAt`:

```ts
    crUploadedAt: timestamp('cr_uploaded_at'),
    // SESSION1-MEET-2 - the applicant's signed return of that CR (current file;
    // history in document_versions, owner type meeting_report_signed). The DN
    // CR above can no longer be replaced once this is set.
    signedCrDocumentUrl: text('signed_cr_document_url'),
    signedCrUploadedAt: timestamp('signed_cr_uploaded_at'),
```

Add the check after `meetings_type_confirmation_chk` in the table's constraint array:

```ts
    // SESSION1-MEET-2 - a signed copy has its date, answers an existing DN CR,
    // and only exists on M3/M4. The "held" rule stays in the service.
    check(
      'meetings_signed_cr_coherent_chk',
      sql`(${t.signedCrDocumentUrl} IS NULL) = (${t.signedCrUploadedAt} IS NULL) AND (${t.signedCrDocumentUrl} IS NULL OR ${t.crDocumentUrl} IS NOT NULL) AND (${t.signedCrDocumentUrl} IS NULL OR ${t.meetingType} IN ('preliminary', 'formal'))`
    ),
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate --workspace=apps/api -- --name session1_meet2_signed_report`

Open `apps/api/drizzle/0010_session1_meet2_signed_report.sql`. It must contain exactly these four statements (statement breakpoints are fine), and nothing else:

```sql
ALTER TYPE "public"."document_owner_type" ADD VALUE 'meeting_report_signed';
ALTER TABLE "meetings" ADD COLUMN "signed_cr_document_url" text;
ALTER TABLE "meetings" ADD COLUMN "signed_cr_uploaded_at" timestamp;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_signed_cr_coherent_chk" CHECK (("meetings"."signed_cr_document_url" IS NULL) = ("meetings"."signed_cr_uploaded_at" IS NULL) AND ("meetings"."signed_cr_document_url" IS NULL OR "meetings"."cr_document_url" IS NOT NULL) AND ("meetings"."signed_cr_document_url" IS NULL OR "meetings"."meeting_type" IN ('preliminary', 'formal')));
```

If drizzle-kit emitted anything else (another table or constraint), the schema has unrelated drift. Stop and report it; do not hand-edit it away.

- [ ] **Step 5: Add the policy helpers**

Append to `apps/api/src/modules/meetings/meeting-confirmation.ts`:

```ts
/** SESSION1-MEET-2 - M3/M4 have a DN compte-rendu and its signed return; M6
 *  has neither: its output is the Agent CI opinion (K6). Guards both the DN
 *  upload and the applicant's signed copy; the DB check
 *  meetings_signed_cr_coherent_chk enforces the same rule for the copy. */
export function acceptsMeetingReport(meetingType: string): boolean {
  return meetingType === 'preliminary' || meetingType === 'formal';
}

/** Same rule as submitSignedMeetingReport, for the read models: M3/M4, held,
 *  DN CR present, dossier open. A replacement is allowed (D3). */
export function canApplicantSubmitSignedReport(
  meeting: { meetingType: string; status: string; crDocumentUrl: string | null },
  dossierClosed: boolean
): boolean {
  return (
    !dossierClosed &&
    acceptsMeetingReport(meeting.meetingType) &&
    meeting.status === 'held' &&
    meeting.crDocumentUrl !== null
  );
}
```

- [ ] **Step 6: Test the helpers**

Append to `apps/api/src/modules/meetings/meeting-confirmation.test.ts`, and add both names to its existing import from `./meeting-confirmation.js`:

```ts
describe('SESSION1-MEET-2 report policy', () => {
  it('acceptsMeetingReport: M3/M4 only', () => {
    assert.equal(acceptsMeetingReport('preliminary'), true);
    assert.equal(acceptsMeetingReport('formal'), true);
    assert.equal(acceptsMeetingReport('site_visit'), false);
  });

  it('canApplicantSubmitSignedReport: held M3/M4 with a DN CR on an open dossier', () => {
    const held = { meetingType: 'preliminary', status: 'held', crDocumentUrl: '/api/files/1' };
    assert.equal(canApplicantSubmitSignedReport(held, false), true);
    assert.equal(canApplicantSubmitSignedReport({ ...held, meetingType: 'formal' }, false), true);
    assert.equal(canApplicantSubmitSignedReport(held, true), false, 'closed dossier');
    assert.equal(canApplicantSubmitSignedReport({ ...held, crDocumentUrl: null }, false), false, 'no DN CR');
    for (const status of ['scheduled', 'no_show', 'rescheduled', 'file_cancelled']) {
      assert.equal(canApplicantSubmitSignedReport({ ...held, status }, false), false, status);
    }
    assert.equal(canApplicantSubmitSignedReport({ ...held, meetingType: 'site_visit' }, false), false, 'M6');
  });
});
```

- [ ] **Step 7: Run the tests**

Run:
- `cd apps/api && npx tsx --test src/modules/meetings/meeting-signed-report.migrations.test.ts src/modules/meetings/meeting-confirmation.test.ts`
- `npx tsx --test src/modules/meetings/meetings.migrations.test.ts src/modules/dn-annotation/dn-annotation.migrations.test.ts`

Expected: PASS. The 0009 test's "never adds a value" applies to 0009 only; the `dn_director_annotation` guard is unaffected.

- [ ] **Step 8: Apply the migration to the disposable DB**

Run: `npm run db:migrate --workspace=apps/api`, then `npm run db:check:committed --workspace=apps/api`.
Expected: success. `db:check:committed` stays red until the files are committed in Task 8; record its message if so.

---

### Task 2: Wire the new owner type (uploads, file access, storage, rewrite, dev-tools)

**Files:**
- Modify: `apps/api/src/modules/uploads/uploads.types.ts`
- Modify: `apps/api/src/modules/files/file-context.ts:19-41,134-142`
- Modify: `apps/api/src/modules/uploads/storage-context.ts:51-60,197-201`
- Modify: `apps/api/src/modules/files/address-rewrite.ts:32`
- Modify: `apps/api/src/modules/dev-tools/dev-tools.service.ts:27-36,194-205`
- Test: `apps/api/src/modules/files/file-context.test.ts`, `apps/api/src/modules/uploads/storage-context.test.ts`

**Interfaces:**
- Consumes: enum value `meeting_report_signed` (Task 1).
- Produces: `UploadOwnerType` includes `'meeting_report_signed'`, so `trashCurrentVersions`, `versionValues`, `RelocationTarget` and `AttachTarget` accept it. Its files resolve to dossier stage `M3` or `M4` and go to the `meeting-reports-signed` folder.

- [ ] **Step 1: Write the failing file-context tests**

In `apps/api/src/modules/files/file-context.test.ts`:

1. In the store's `findOwnerPhaseId` table, add `meeting_report_signed: { 17: 30 },` after `meeting_report: { 16: 40 },`.
2. Add `['meeting_report_signed', 17, 'M3'],` to the `cases` array, after `['meeting_report', 16, 'M4'],`.
3. Add `import { canAccessFile } from './file-access.policy.js';` to the imports.
4. Add inside `describe('resolveAssetContext', ...)`:

```ts
  it('SESSION1-MEET-2 - both CR chains: owning applicant and the DN roles only', async () => {
    for (const [ownerType, ownerId] of [['meeting_report', 16], ['meeting_report_signed', 17]] as const) {
      const context = await resolveAssetContext(asset({ linkedOwnerType: ownerType, linkedOwnerId: ownerId }), store);
      assert.equal(canAccessFile({ kind: 'applicant', applicantId: 7 }, context), true, `${ownerType}: owner`);
      assert.equal(canAccessFile({ kind: 'applicant', applicantId: 8 }, context), false, `${ownerType}: other applicant`);
      for (const role of ['dn_agent', 'dn_supervisor', 'SU']) {
        assert.equal(canAccessFile({ kind: 'staff', userId: 1, roles: [role] }, context), true, `${ownerType}: ${role}`);
      }
      for (const role of ['r3_agent', 's5_agent', 'reception', 'assistant_dg', 'assistant_dn']) {
        assert.equal(canAccessFile({ kind: 'staff', userId: 1, roles: [role] }, context), false, `${ownerType}: ${role}`);
      }
    }
  });

  it('an owner type nobody mapped is unresolvable (fail-closed, SU only)', async () => {
    const context = await resolveAssetContext(asset({ linkedOwnerType: 'not_mapped_yet', linkedOwnerId: 17 }), store);
    assert.deepEqual(context, { kind: 'unresolvable' });
  });
```

- [ ] **Step 2: Write the failing storage-context tests**

In `apps/api/src/modules/uploads/storage-context.test.ts`:

1. Add `'meeting_report_signed',` after `'meeting_report',` in the `isRelocatableOwnerType` loop list.
2. Add after the `meeting_report` test:

```ts
  it('meeting_report_signed resolves through meetings.phaseId into its own folder (SESSION1-MEET-2)', async () => {
    for (const phaseCode of ['M3', 'M4'] as const) {
      const ctx = await resolveStorageContext(
        'meeting_report_signed',
        7,
        deps({ meetingReport: async () => ({ reference: 'DEM-REF', phaseCode }) })
      );
      assert.deepEqual(ctx, {
        requestReference: 'DEM-REF',
        phaseFolder: PHASE_FOLDERS[phaseCode],
        categorySlug: 'meeting-reports-signed',
      });
    }
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd apps/api && npx tsx --test src/modules/files/file-context.test.ts src/modules/uploads/storage-context.test.ts`
Expected: FAIL. `meeting_report_signed` resolves to `unresolvable` / `null`, and `isRelocatableOwnerType` is false.

- [ ] **Step 4: Implement the wiring**

`apps/api/src/modules/uploads/uploads.types.ts`: add `'meeting_report_signed',` after `'meeting_report',` in `UPLOAD_OWNER_TYPES`.

`apps/api/src/modules/files/file-context.ts`:
- `PhaseOwnedType`: change `| 'meeting_report';` to `| 'meeting_report'` and add `| 'meeting_report_signed';`.
- `PHASE_OWNED`: add `'meeting_report_signed',`.
- In `findOwnerPhaseId`'s table: add `meeting_report_signed: schema.meetings,` after `meeting_report: schema.meetings,`.

`apps/api/src/modules/uploads/storage-context.ts`:
- `RELOCATABLE_OWNER_TYPES_LIST`: add `'meeting_report_signed',` after `'meeting_report',`.
- Add after the `case 'meeting_report':` block:

```ts
    // SESSION1-MEET-2 - same meeting (same deps lookup), its own folder next to
    // the DN's, so the two chains never share a path.
    case 'meeting_report_signed': {
      const row = await deps.meetingReport(ownerId);
      if (!row) return null;
      return {
        requestReference: row.reference,
        phaseFolder: PHASE_FOLDERS[row.phaseCode],
        categorySlug: 'meeting-reports-signed',
      };
    }
```

`apps/api/src/modules/files/address-rewrite.ts`: add after the `cr_document_url` row:

```ts
  { table: 'meetings', column: 'signed_cr_document_url', ownerTypeSql: "'meeting_report_signed'", ownerIdSql: 'id', mimeSql: null },
```

`apps/api/src/modules/dev-tools/dev-tools.service.ts`:
- `WORKFLOW_DOCUMENT_OWNER_TYPES`: add `'meeting_report_signed',` after `'meeting_report',`.
- In both `DELETE ... IN (...)` SQL lists: replace `'payment_invoice', 'payment_proof', 'meeting_report', 'phase_closure_document',` with `'payment_invoice', 'payment_proof', 'meeting_report', 'meeting_report_signed', 'phase_closure_document',`.

- [ ] **Step 5: Run the tests**

Run:
- `cd apps/api && npx tsx --test src/modules/files/*.test.ts src/modules/uploads/*.test.ts`
- `npm run typecheck --workspace=apps/api`

Expected: PASS. If the typecheck flags a `Record<UploadOwnerType, ...>` lacking the new key, add the entry there with the same value as `meeting_report`. Report any such file in the task summary.

---

### Task 3: DN upload guards (M6 refused, frozen after a signed copy) and shared applicant lock

**Files:**
- Modify: `apps/api/src/modules/meetings/meeting-write.ts`
- Modify: `apps/api/src/modules/meetings/meeting-negotiation.service.ts:10-43`
- Modify: `apps/api/src/modules/meetings/meetings.service.ts:612-660` (`attachMeetingReport`)
- Modify: `apps/api/src/shared/utils/error.ts` (`handleMeetingsError`)
- Create: `apps/api/src/modules/meetings/meeting-signed-report.db.test.ts`

**Interfaces:**
- Consumes: `acceptsMeetingReport` (Task 1); owner type `meeting_report_signed` (Task 2).
- Produces:
  - `lockOwnedMeeting(tx: DbTx, meetingId: number, applicantId: number): Promise<MeetingRow>`, exported from `meeting-write.ts`;
  - error codes `MEETING_REPORT_NOT_APPLICABLE`, `MEETING_REPORT_FROZEN_SIGNED`, `MEETING_REPORT_MISSING` (all 409);
  - the DB test harness that Task 4 and Task 5 extend.

- [ ] **Step 1: Write the failing DB tests**

Create `apps/api/src/modules/meetings/meeting-signed-report.db.test.ts`:

```ts
/** SESSION1-MEET-2 - DN compte-rendu and the applicant's signed return
 *  against a real PostgreSQL (skipped without DATABASE_URL; needs a
 *  migrated, disposable database). Seeds its own dossiers. Upload assets are
 *  inserted directly (storage key outside staging/, so the after-commit
 *  relocation is a no-op). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import type { PreparedAttachment } from '../uploads/upload-attachment.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const DAY = 86_400_000;
type MeetingType = 'preliminary' | 'formal' | 'site_visit';

describe('SESSION1-MEET-2 signed meeting report (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let meetings: typeof import('./meetings.service.js');
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;
  let slotSeq = 0;
  const slot = (days: number) => new Date(Date.now() + days * DAY + ++slotSeq * 60_000);

  before(async () => {
    // timestamp columns hold UTC: read them back as UTC (gotcha #25).
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      types: {
        getTypeParser: ((oid: number, format?: string) =>
          oid === 1114
            ? (value: string) => new Date(`${value.replace(' ', 'T')}Z`)
            : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
      },
    });
    meetings = await import('./meetings.service.js');
    const dbModule = await import('../../shared/db/index.js');
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const all = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

  async function user() {
    const code = `MR${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [
      code,
      `${code}@test.local`,
    ])).id as number;
  }

  /** A dossier with M3, M4 and M6 phases. */
  async function dossier(status = 'pending_review') {
    const k = `${tag}-${++n}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA MEET2 ${k}`]
    )).id;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`,
      [org, `p2-${k}@test.local`]
    )).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-MEET2-${k}`, applicant, org, status]
    )).id as number;
    const phase: Record<string, number> = {};
    for (const code of ['M3', 'M4', 'M6']) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [request, code])).id;
    }
    return { applicant, request, phase };
  }

  /** A meeting row in the given state (no negotiation history needed here). */
  async function meeting(phaseId: number, agent: number, meetingType: MeetingType = 'preliminary', status = 'held') {
    const siteVisit = meetingType === 'site_visit';
    return (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [phaseId, meetingType, agent, slot(status === 'scheduled' ? 5 : -1), status, siteVisit ? 'not_required' : 'confirmed', siteVisit ? null : new Date()]
    )).id as number;
  }

  /** A real upload_assets row owned by a staff user or an applicant. */
  async function asset(owner: { userId: number } | { applicantId: number }): Promise<PreparedAttachment> {
    const userId = 'userId' in owner ? owner.userId : null;
    const applicantId = 'applicantId' in owner ? owner.applicantId : null;
    const { id } = await one(
      `INSERT INTO upload_assets (file_url, storage_key, original_name, mime_type, size_bytes,
                                  uploaded_by_user_id, uploaded_by_applicant_id, uploaded_from_app)
       VALUES ('pending', $1, 'cr.pdf', 'application/pdf', 4, $2, $3, $4) RETURNING id`,
      [`meet2-test/${tag}-${++n}.pdf`, userId, applicantId, userId ? 'admin' : 'portal']
    );
    const fileUrl = `/api/files/${id}`;
    await pool.query(`UPDATE upload_assets SET file_url = $1 WHERE id = $2`, [fileUrl, id]);
    return {
      assetId: id,
      fileUrl,
      mimeType: 'application/pdf',
      originalName: 'cr.pdf',
      sizeBytes: 4,
      uploadedByUserId: userId,
      actor: userId ? { kind: 'staff', userId } : { kind: 'applicant', applicantId: applicantId! },
    };
  }

  const row = (id: number) => one(`SELECT * FROM meetings WHERE id = $1`, [id]);
  const versions = (ownerType: string, ownerId: number) =>
    all(`SELECT * FROM document_versions WHERE owner_type = $1 AND owner_id = $2 ORDER BY id`, [ownerType, ownerId]);
  const current = async (ownerType: string, ownerId: number) =>
    (await versions(ownerType, ownerId)).filter((v) => v.is_current && v.trashed_at === null);
  const audits = (id: number, action: string) =>
    all(`SELECT * FROM audit_logs WHERE entity_id = $1 AND action = $2 ORDER BY id`, [id, action]);

  /** The DN uploads a CR through the real service. */
  async function dnReport(meetingId: number, agent: number) {
    const attachment = await asset({ userId: agent });
    await meetings.attachMeetingReport(meetingId, agent, attachment);
    return attachment;
  }

  describe('DN original (meeting_report)', () => {
    it('upload then replace before any signed copy: one current version, one trashed', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M3, agent);
      await dnReport(id, agent);
      const second = await dnReport(id, agent);
      assert.equal((await row(id)).cr_document_url, second.fileUrl);
      const chain = await versions('meeting_report', id);
      assert.equal(chain.length, 2);
      assert.deepEqual((await current('meeting_report', id)).map((v) => v.file_url), [second.fileUrl]);
    });

    it('refused on a site visit (D1), nothing written', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M6, agent, 'site_visit');
      await assert.rejects(dnReport(id, agent), /MEETING_REPORT_NOT_APPLICABLE/);
      assert.equal((await row(id)).cr_document_url, null);
      assert.equal((await versions('meeting_report', id)).length, 0);
    });

    it('refused before the meeting is held', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M4, agent, 'formal', 'scheduled');
      await assert.rejects(dnReport(id, agent), /MEETING_NOT_HELD/);
    });

    it('frozen once a signed copy exists (D2): MEETING_REPORT_FROZEN_SIGNED, CR and chain untouched', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M3, agent);
      const first = await dnReport(id, agent);
      await pool.query(
        `UPDATE meetings SET signed_cr_document_url = '/api/files/999999', signed_cr_uploaded_at = now() WHERE id = $1`,
        [id]
      );
      await assert.rejects(dnReport(id, agent), /MEETING_REPORT_FROZEN_SIGNED/);
      assert.equal((await row(id)).cr_document_url, first.fileUrl);
      assert.equal((await versions('meeting_report', id)).length, 1);
    });
  });

  describe('DB check meetings_signed_cr_coherent_chk', () => {
    it('rejects a signed copy without its date, without a DN CR, or on a site visit', async () => {
      const d = await dossier();
      const agent = await user();
      const m3 = await meeting(d.phase.M3, agent);
      await assert.rejects(
        pool.query(`UPDATE meetings SET signed_cr_document_url = '/api/files/1', signed_cr_uploaded_at = now() WHERE id = $1`, [m3]),
        /meetings_signed_cr_coherent_chk/,
        'no DN CR'
      );
      await pool.query(`UPDATE meetings SET cr_document_url = '/api/files/2', cr_uploaded_at = now() WHERE id = $1`, [m3]);
      await assert.rejects(
        pool.query(`UPDATE meetings SET signed_cr_document_url = '/api/files/1' WHERE id = $1`, [m3]),
        /meetings_signed_cr_coherent_chk/,
        'no date'
      );
      const visit = await meeting(d.phase.M6, agent, 'site_visit');
      await assert.rejects(
        pool.query(
          `UPDATE meetings SET cr_document_url = '/api/files/3', cr_uploaded_at = now(),
                  signed_cr_document_url = '/api/files/4', signed_cr_uploaded_at = now() WHERE id = $1`,
          [visit]
        ),
        /meetings_signed_cr_coherent_chk/,
        'site visit'
      );
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx tsx --test src/modules/meetings/meeting-signed-report.db.test.ts`
Expected (with `DATABASE_URL`):
- FAIL on « refused on a site visit » (no error thrown);
- FAIL on « frozen » (the replacement succeeds);
- the check test PASSES already (Task 1).

- [ ] **Step 3: Move `lockOwnedMeeting` into `meeting-write.ts`**

In `apps/api/src/modules/meetings/meeting-write.ts`, change the schema import to `import { meetings, phases, requests } from '../../shared/db/schema.js';`. `and` and `eq` are already imported from drizzle-orm. Then add after `lockMeeting`:

```ts
/** MEETINGS-IDOR - an applicant write on a meeting (SESSION1-MEET-1 commands,
 *  SESSION1-MEET-2 signed report). Ownership (meeting -> phase -> request ->
 *  applicant) is checked first, so another applicant's meeting is a 404
 *  whatever its dossier state; then the usual dossier guard and row lock. */
export async function lockOwnedMeeting(tx: DbTx, meetingId: number, applicantId: number): Promise<MeetingRow> {
  const [owned] = await tx
    .select({ id: meetings.id })
    .from(meetings)
    .innerJoin(phases, eq(phases.id, meetings.phaseId))
    .innerJoin(requests, eq(requests.id, phases.requestId))
    .where(and(eq(meetings.id, meetingId), eq(requests.applicantId, applicantId)));
  if (!owned) throw new Error('MEETING_NOT_FOUND');
  return lockMeeting(tx, meetingId);
}
```

In `apps/api/src/modules/meetings/meeting-negotiation.service.ts`:
- delete the private `lockOwnedMeeting` function and its doc comment;
- add `lockOwnedMeeting,` to the `./meeting-write.js` import list;
- remove `phases` and `requests` from the schema import if they are now unused, and `and` from drizzle-orm if unused (the typecheck and lint tell you).

- [ ] **Step 4: Add the DN guards**

In `attachMeetingReport` (`apps/api/src/modules/meetings/meetings.service.ts`), replace:

```ts
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return meeting;
    if (meeting.status !== 'held') throw new Error('MEETING_NOT_HELD');
```

with:

```ts
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return meeting;
    if (!acceptsMeetingReport(meeting.meetingType)) throw new Error('MEETING_REPORT_NOT_APPLICABLE');
    // SESSION1-MEET-2 (D2) - the applicant signed this exact file: checked
    // under the meeting row lock, so a concurrent signed upload is serialized.
    if (meeting.signedCrDocumentUrl !== null) throw new Error('MEETING_REPORT_FROZEN_SIGNED');
    if (meeting.status !== 'held') throw new Error('MEETING_NOT_HELD');
```

Then:
- add `acceptsMeetingReport,` to the `./meeting-confirmation.js` import;
- update the function's doc comment to say: optional, M3/M4 only, replaceable until the applicant returns a signed copy.

- [ ] **Step 5: Add the French error messages**

In `apps/api/src/shared/utils/error.ts`, inside `handleMeetingsError`'s table, before `...UPLOAD_ATTACH_ERRORS,`:

```ts
    // SESSION1-MEET-2 - compte rendu and its signed return.
    MEETING_REPORT_NOT_APPLICABLE: {
      status: 409,
      message: "Une visite sur site n'a pas de compte rendu de réunion.",
    },
    MEETING_REPORT_FROZEN_SIGNED: {
      status: 409,
      message:
        'Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant.',
    },
    MEETING_REPORT_MISSING: {
      status: 409,
      message: "Le compte rendu de la DN n'est pas encore disponible.",
    },
```

- [ ] **Step 6: Run the tests**

Run:
- `cd apps/api && npx tsx --test src/modules/meetings/meeting-signed-report.db.test.ts src/modules/meetings/meeting-negotiation.db.test.ts`
- `npm run typecheck --workspace=apps/api`

Expected: PASS. The MEET-1 negotiation suite is unchanged (same lock, moved).

---

### Task 4: Applicant command `POST /meetings/:id/signed-report`

**Files:**
- Create: `apps/api/src/modules/meetings/meeting-signed-report.service.ts`
- Modify: `apps/api/src/modules/meetings/meetings.controller.ts`, `apps/api/src/modules/meetings/meetings.route.ts`
- Modify: `apps/api/src/modules/auth/audit-request.ts:62`, `apps/api/src/modules/requests/requests.service.ts:121`
- Test: `apps/api/src/modules/meetings/meeting-signed-report.db.test.ts` (extend), `apps/api/src/modules/meetings/meeting-negotiation.routes.test.ts`, `apps/api/src/modules/requests/dossier-open.routes.test.ts`, `apps/api/src/modules/requests/dossier-open.db.test.ts`

**Interfaces:**
- Consumes: `lockOwnedMeeting`, `phaseCodeOf`, `MeetingRow` (`meeting-write.ts`); `acceptsMeetingReport`; `claimUploadAsset`, `trashCurrentVersions`, `versionValues`, `linkLockedAsset`, `PreparedAttachment`; `relocateDossierAssetAfterCommit`, `RelocationTarget`.
- Produces: `submitSignedMeetingReport(meetingId: number, applicantId: number, attachment: PreparedAttachment): Promise<MeetingRow>`. The route returns `200` with the `getMeeting(id, { applicant })` payload, completed in Task 5.

- [ ] **Step 1: Write the failing DB tests**

In `meeting-signed-report.db.test.ts`:
- add `let signed: typeof import('./meeting-signed-report.service.js');` next to `meetings`;
- in `before`, add `signed = await import('./meeting-signed-report.service.js');`;
- append this `describe` inside the outer one:

```ts
  describe('applicant signed copy (meeting_report_signed)', () => {
    async function heldWithReport(meetingType: MeetingType = 'preliminary', status = 'pending_review') {
      const d = await dossier();
      const agent = await user();
      const phaseId = meetingType === 'formal' ? d.phase.M4 : d.phase.M3;
      const id = await meeting(phaseId, agent, meetingType);
      const dn = await dnReport(id, agent);
      if (status !== 'pending_review') await pool.query(`UPDATE requests SET status = $1 WHERE id = $2`, [status, d.request]);
      return { d, agent, id, dn };
    }

    for (const meetingType of ['preliminary', 'formal'] as const) {
      it(`${meetingType}: stored on its own chain, audited as the applicant, DN chain untouched`, async () => {
        const { d, id, dn } = await heldWithReport(meetingType);
        const copy = await asset({ applicantId: d.applicant });
        await signed.submitSignedMeetingReport(id, d.applicant, copy);

        const saved = await row(id);
        assert.equal(saved.signed_cr_document_url, copy.fileUrl);
        assert.ok(saved.signed_cr_uploaded_at instanceof Date);
        assert.equal(saved.cr_document_url, dn.fileUrl, 'DN CR unchanged');
        assert.deepEqual((await current('meeting_report_signed', id)).map((v) => v.file_url), [copy.fileUrl]);
        assert.deepEqual((await current('meeting_report', id)).map((v) => v.file_url), [dn.fileUrl]);
        const linked = await one(`SELECT linked_owner_type, linked_owner_id FROM upload_assets WHERE id = $1`, [copy.assetId]);
        assert.deepEqual(linked, { linked_owner_type: 'meeting_report_signed', linked_owner_id: id });

        const [audit] = await audits(id, 'MEETING_SIGNED_REPORT_SUBMITTED');
        assert.equal(audit.applicant_id, d.applicant);
        assert.equal(audit.user_id, null);
        assert.equal(audit.module, meetingType === 'formal' ? 'M4' : 'M3');
        assert.equal(audit.request_id, d.request, 'dossier-linked (audit-request mapping)');
        assert.deepEqual(audit.details, { replaced: false });
      });
    }

    it('replacement (D3): trashes only the previous signed version, logs replaced: true', async () => {
      const { d, id, dn } = await heldWithReport();
      const first = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, first);
      const second = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, second);

      assert.equal((await row(id)).signed_cr_document_url, second.fileUrl);
      assert.equal((await versions('meeting_report_signed', id)).length, 2);
      assert.deepEqual((await current('meeting_report_signed', id)).map((v) => v.file_url), [second.fileUrl]);
      assert.deepEqual((await current('meeting_report', id)).map((v) => v.file_url), [dn.fileUrl], 'DN chain untouched');
      const logged = await audits(id, 'MEETING_SIGNED_REPORT_SUBMITTED');
      assert.deepEqual(logged.map((a) => a.details), [{ replaced: false }, { replaced: true }]);
    });

    it('replay of the same asset: no new version, no new audit', async () => {
      const { d, id } = await heldWithReport();
      const copy = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, copy);
      await signed.submitSignedMeetingReport(id, d.applicant, copy);
      assert.equal((await versions('meeting_report_signed', id)).length, 1);
      assert.equal((await audits(id, 'MEETING_SIGNED_REPORT_SUBMITTED')).length, 1);
    });

    it('after the signed copy, the DN CR is frozen (end to end)', async () => {
      const { d, agent, id, dn } = await heldWithReport();
      await signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant }));
      await assert.rejects(dnReport(id, agent), /MEETING_REPORT_FROZEN_SIGNED/);
      assert.equal((await row(id)).cr_document_url, dn.fileUrl);
    });

    it('refused without a DN CR', async () => {
      const d = await dossier();
      const id = await meeting(d.phase.M3, await user());
      await assert.rejects(
        signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
        /MEETING_REPORT_MISSING/
      );
    });

    it('refused on a meeting that is not held', async () => {
      const d = await dossier();
      for (const status of ['scheduled', 'no_show']) {
        const id = await meeting(d.phase.M3, await user(), 'preliminary', status);
        await assert.rejects(
          signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
          /MEETING_NOT_HELD/,
          status
        );
      }
    });

    it('refused on a site visit', async () => {
      const d = await dossier();
      const id = await meeting(d.phase.M6, await user(), 'site_visit');
      await assert.rejects(
        signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
        /MEETING_REPORT_NOT_APPLICABLE/
      );
    });

    it('another applicant gets MEETING_NOT_FOUND, even on a closed dossier', async () => {
      const { id } = await heldWithReport('preliminary', 'cancelled');
      const other = await dossier();
      await assert.rejects(
        signed.submitSignedMeetingReport(id, other.applicant, await asset({ applicantId: other.applicant })),
        /MEETING_NOT_FOUND/
      );
    });

    it('closed dossier: DOSSIER_CLOSED, nothing written', async () => {
      const { d, id } = await heldWithReport('preliminary', 'completed');
      await assert.rejects(
        signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
        /DOSSIER_CLOSED/
      );
      assert.equal((await row(id)).signed_cr_document_url, null);
    });

    it("an asset already linked elsewhere is refused (the same dossier's M3 signed copy reused on M4)", async () => {
      const { d, agent, id } = await heldWithReport();
      const formal = await meeting(d.phase.M4, agent, 'formal');
      await dnReport(formal, agent);
      const copy = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, copy);
      await assert.rejects(signed.submitSignedMeetingReport(formal, d.applicant, copy), /UPLOAD_ASSET_ALREADY_LINKED/);
      assert.equal((await row(formal)).signed_cr_document_url, null);
    });

    it('the activity label is the same for submission and replacement', async () => {
      const { ACTIVITY_LABELS } = await import('../requests/requests.service.js');
      assert.deepEqual(ACTIVITY_LABELS.MEETING_SIGNED_REPORT_SUBMITTED, {
        title: 'Compte rendu signé transmis par le postulant',
        tone: 'info',
      });
    });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx tsx --test src/modules/meetings/meeting-signed-report.db.test.ts`
Expected: FAIL with `Cannot find module './meeting-signed-report.service.js'`.

- [ ] **Step 3: Write the service**

Create `apps/api/src/modules/meetings/meeting-signed-report.service.ts`:

```ts
/** SESSION1-MEET-2 - the applicant returns the DN compte-rendu signed. Its own
 *  owner chain (meeting_report_signed), never the DN's (meeting_report): both
 *  share the meeting id and, since every trash/link is scoped by owner type
 *  AND id, neither can touch the other. No DN validation step: receiving the
 *  file is the whole workflow. Replacing it is allowed while the dossier is
 *  open (decision D3); the DN CR is frozen from the first signed copy on. */
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { documentVersions, meetings } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { acceptsMeetingReport } from './meeting-confirmation.js';
import { lockOwnedMeeting, phaseCodeOf, type MeetingRow } from './meeting-write.js';

export async function submitSignedMeetingReport(
  meetingId: number,
  applicantId: number,
  attachment: PreparedAttachment
): Promise<MeetingRow> {
  const target: RelocationTarget = { ownerType: 'meeting_report_signed', ownerId: meetingId };
  const saved = await db.transaction(async (tx) => {
    // Ownership first (404), then the K7 dossier guard and the meeting row lock.
    const meeting = await lockOwnedMeeting(tx, meetingId, applicantId);
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return meeting;
    if (!acceptsMeetingReport(meeting.meetingType)) throw new Error('MEETING_REPORT_NOT_APPLICABLE');
    if (meeting.status !== 'held') throw new Error('MEETING_NOT_HELD');
    if (meeting.crDocumentUrl === null) throw new Error('MEETING_REPORT_MISSING');
    const replaced = meeting.signedCrDocumentUrl !== null;

    await trashCurrentVersions(tx, 'meeting_report_signed', meetingId);
    await tx.insert(documentVersions).values(versionValues(attachment, 'meeting_report_signed', meetingId));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [updated] = await tx
      .update(meetings)
      .set({ signedCrDocumentUrl: attachment.fileUrl, signedCrUploadedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .returning();

    await logAudit(
      {
        applicantId,
        action: 'MEETING_SIGNED_REPORT_SUBMITTED',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
        details: { replaced },
      },
      tx
    );
    return updated;
  });

  await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return saved;
}
```

- [ ] **Step 4: Add the audit mapping and the label**

- `apps/api/src/modules/auth/audit-request.ts`: add `MEETING_SIGNED_REPORT_SUBMITTED: 'meeting',` after `MEETING_REPORT_ATTACHED: 'meeting',`.
- `apps/api/src/modules/requests/requests.service.ts`, in `ACTIVITY_LABELS` after `MEETING_REPORT_ATTACHED`:

```ts
  // SESSION1-MEET-2 - one label for a first copy and a replacement
  // (details.replaced stays in the audit entry).
  MEETING_SIGNED_REPORT_SUBMITTED: { title: 'Compte rendu signé transmis par le postulant', tone: 'info' },
```

- [ ] **Step 5: Run the DB tests**

Run: `cd apps/api && npx tsx --test src/modules/meetings/meeting-signed-report.db.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the route tests (failing)**

In `apps/api/src/modules/meetings/meeting-negotiation.routes.test.ts`:
- `const APPLICANT_WRITES = ['POST /:id/confirm', 'POST /:id/propose-alternate', 'POST /:id/signed-report'];`
- rename `'gives the applicant exactly two write routes, applicant-authenticated only'` to `'gives the applicant exactly its write routes, applicant-authenticated only'`;
- update the header comment: three applicant routes (confirm, propose-alternate, signed-report).

In `apps/api/src/modules/requests/dossier-open.routes.test.ts`: add `'meetings POST /:id/signed-report': 'guarded',` after `'meetings POST /:id/propose-alternate': 'guarded',`.

In `apps/api/src/modules/requests/dossier-open.db.test.ts`:
1. Add `import('../meetings/meeting-signed-report.service.js'),` to the `Promise.all` right after `import('../meetings/meeting-negotiation.service.js'),`.
2. Add `signedReport` to the destructured names right after `negotiation` (line 51), to the `m = { ... }` object (line 66) and to the destructuring at line 123.
3. Add after the `'meeting alternate proposed by the applicant'` entry:

```ts
      ['meeting signed report submitted (applicant)', () => signedReport.submitSignedMeetingReport(d.meeting, d.applicant, attachment)],
```

Run: `cd apps/api && npx tsx --test src/modules/meetings/meeting-negotiation.routes.test.ts src/modules/requests/dossier-open.routes.test.ts`
Expected: FAIL (`POST /:id/signed-report is missing`, unknown route).

- [ ] **Step 7: Add the controller and route**

In `apps/api/src/modules/meetings/meetings.controller.ts`:
- add `import * as signedReportService from './meeting-signed-report.service.js';`;
- add after `onBehalfBody`:

```ts
// SESSION1-MEET-2 - the applicant names only the uploaded file; the meeting is
// the URL, the applicant the token.
const signedReportBody = z.object({ uploadAssetId: z.union([z.number(), z.string()]) }).strict();
```

- add after `proposeAlternate`:

```ts
/** POST /meetings/:id/signed-report - applicant only, own held M3/M4 meeting
 *  with a DN compte-rendu (SESSION1-MEET-2). First copy or replacement. */
export async function submitSignedReport(req: Request, res: Response): Promise<void> {
  try {
    const body = parseBody(signedReportBody, req, res, 'Seul le fichier téléversé (uploadAssetId) est attendu.');
    if (!body) return;
    const applicant = req.applicant!;
    const attachment = await prepareUploadAttachment(parseUploadAssetId(body.uploadAssetId), {
      kind: 'applicant',
      applicantId: applicant.applicantId,
    });
    const meetingId = Number(req.params.id);
    await signedReportService.submitSignedMeetingReport(meetingId, applicant.applicantId, attachment);
    res.json(await meetingsService.getMeeting(meetingId, { applicant }));
  } catch (error) {
    handleMeetingsError(res, error);
  }
}
```

In `apps/api/src/modules/meetings/meetings.route.ts`, replace the applicant block's comment and routes with:

```ts
// Applicant side: the only applicant writes on meetings. Identity comes from
// the token; ownership is checked inside the transaction (404 otherwise).
router.post('/:id/confirm', authenticateApplicant, meetingsController.confirm);
router.post('/:id/propose-alternate', authenticateApplicant, meetingsController.proposeAlternate);
// SESSION1-MEET-2 - signed return of the DN compte-rendu.
router.post('/:id/signed-report', authenticateApplicant, meetingsController.submitSignedReport);
```

- [ ] **Step 8: Run the route and matrix tests**

Run: `cd apps/api && npx tsx --test src/modules/meetings/*.test.ts src/modules/requests/dossier-open.routes.test.ts src/modules/requests/dossier-open.db.test.ts`
Expected: PASS. In the closed matrix, the new entry is refused with `DOSSIER_CLOSED` and the DB is unchanged.

---

### Task 5: Read models (signed fields everywhere, `canSubmitSignedReport` for the applicant)

**Files:**
- Modify: `apps/api/src/modules/meetings/meetings.types.ts`, `apps/api/src/modules/meetings/meetings.service.ts` (`toMeetingView`, `toCockpitItem`, `listApplicantMeetings`, `getMeeting`)
- Modify: `apps/api/src/modules/meetings/applicant-view.ts`, `apps/api/src/modules/meetings/bundle-meeting.ts`
- Test: `apps/api/src/modules/meetings/applicant-view.test.ts`, `apps/api/src/modules/meetings/meeting-signed-report.db.test.ts` (extend)

**Interfaces:**
- Consumes: `canApplicantSubmitSignedReport` (Task 1); `submitSignedMeetingReport` (Task 4).
- Produces (JSON field names the front ends rely on):
  - `MeetingView`, staff and applicant bundle meeting: `signedCrDocumentUrl: string | null`, `signedCrUploadedAt: Date | null`.
  - `MeetingCockpitItem`: `signedCrDocumentUrl: string | null`, `signedCrUploadedAt: string | null`.
  - `ApplicantMeetingView`: adds `signedCrDocumentUrl`, `signedCrUploadedAt` (Date) and `canSubmitSignedReport: boolean`.
  - `ApplicantMeetingItem`: adds `crUploadedAt: string | null`, `signedCrDocumentUrl`, `signedCrUploadedAt: string | null` and `canSubmitSignedReport: boolean`.
  - Applicant bundle meeting: adds `canSubmitSignedReport: boolean`.
  - `toApplicantMeetingView(view: MeetingView, block: ApplicantNegotiationBlock, canSubmitSignedReport: boolean): ApplicantMeetingView`.

- [ ] **Step 1: Update the pure view test (failing)**

In `apps/api/src/modules/meetings/applicant-view.test.ts`:
- in `view()`: add `signedCrDocumentUrl: null, signedCrUploadedAt: null,` after `crUploadedAt: null,`;
- in `meetingRow()`: add the same two fields after `crUploadedAt: null,`;
- replace the first test with:

```ts
  it('drops dnAgentId and keeps every other field plus the negotiation block and the signed-report flag', () => {
    const expected: Record<string, unknown> = { ...view(), ...block(), canSubmitSignedReport: false };
    delete expected.dnAgentId;
    assert.deepEqual(toApplicantMeetingView(view(), block(), false), expected);
    assert.doesNotMatch(JSON.stringify(toApplicantMeetingView(view(), block(), false)), /dnAgentId|:42\b/);
  });

  it('SESSION1-MEET-2 - passes both report files and the upload flag through', () => {
    const signedAt = new Date('2026-10-16T09:00:00Z');
    const source: MeetingView = {
      ...view(),
      meetingType: 'preliminary',
      status: 'held',
      crDocumentUrl: '/api/files/1',
      crUploadedAt: AT,
      signedCrDocumentUrl: '/api/files/2',
      signedCrUploadedAt: signedAt,
    };
    const result = toApplicantMeetingView(source, block(), true);
    assert.equal(result.crDocumentUrl, '/api/files/1');
    assert.equal(result.signedCrDocumentUrl, '/api/files/2');
    assert.equal(result.signedCrUploadedAt, signedAt);
    assert.equal(result.canSubmitSignedReport, true);
  });
```

- in the whitelist test: change the call to `toApplicantMeetingView(source, extra, false)`.

Run: `cd apps/api && npx tsx --test src/modules/meetings/applicant-view.test.ts`
Expected: FAIL (fields missing and an extra argument).

- [ ] **Step 2: Change the types**

In `apps/api/src/modules/meetings/meetings.types.ts`:
- `MeetingView`: after `crUploadedAt: Date | null;` add:

```ts
  /** SESSION1-MEET-2 - the applicant's signed return (M3/M4 only). */
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: Date | null;
```

- `MeetingCockpitItem`: after `crUploadedAt: string | null;` add:

```ts
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: string | null;
```

- `ApplicantMeetingItem`: after `crDocumentUrl: string | null;` add:

```ts
  crUploadedAt: string | null;
  /** SESSION1-MEET-2 - signed return, and whether you may upload / replace it now. */
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: string | null;
  canSubmitSignedReport: boolean;
```

- [ ] **Step 3: Implement the views**

`apps/api/src/modules/meetings/meetings.service.ts`:
- `toMeetingView`: add `signedCrDocumentUrl: row.signedCrDocumentUrl, signedCrUploadedAt: row.signedCrUploadedAt,` after `crUploadedAt`.
- `toCockpitItem`: add after `crUploadedAt`:

```ts
    signedCrDocumentUrl: row.meeting.signedCrDocumentUrl,
    signedCrUploadedAt: row.meeting.signedCrUploadedAt?.toISOString() ?? null,
```

- `listApplicantMeetings`: replace `crDocumentUrl: meeting.crDocumentUrl,` with:

```ts
    crDocumentUrl: meeting.crDocumentUrl,
    crUploadedAt: meeting.crUploadedAt?.toISOString() ?? null,
    signedCrDocumentUrl: meeting.signedCrDocumentUrl,
    signedCrUploadedAt: meeting.signedCrUploadedAt?.toISOString() ?? null,
    canSubmitSignedReport: canApplicantSubmitSignedReport(meeting, closedById.get(meeting.id) ?? true),
```

- `getMeeting`: replace `return toApplicantMeetingView(view, blocks.get(meeting.id)!);` with:

```ts
    return toApplicantMeetingView(view, blocks.get(meeting.id)!, canApplicantSubmitSignedReport(meeting, closed()));
```

- add `canApplicantSubmitSignedReport,` to the `./meeting-confirmation.js` import.

`apps/api/src/modules/meetings/applicant-view.ts`:
- `ApplicantMeetingView`: add after `crUploadedAt: Date | null;`:

```ts
  /** SESSION1-MEET-2 - your signed return, and whether you may upload / replace it now. */
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: Date | null;
  canSubmitSignedReport: boolean;
```

- change the signature to `export function toApplicantMeetingView(view: MeetingView, block: ApplicantNegotiationBlock, canSubmitSignedReport: boolean): ApplicantMeetingView {`;
- add to the returned object after `crUploadedAt: view.crUploadedAt,`:

```ts
    signedCrDocumentUrl: view.signedCrDocumentUrl,
    signedCrUploadedAt: view.signedCrUploadedAt,
    canSubmitSignedReport,
```

`apps/api/src/modules/meetings/bundle-meeting.ts`:
- `BundleMeetingBase`: add `signedCrDocumentUrl: string | null; signedCrUploadedAt: Date | null;`.
- `ApplicantBundleMeeting`: `export type ApplicantBundleMeeting = BundleMeetingBase & ApplicantNegotiationBlock & { canSubmitSignedReport: boolean };`
- in `base`: add `signedCrDocumentUrl: meeting.signedCrDocumentUrl, signedCrUploadedAt: meeting.signedCrUploadedAt,`.
- applicant branch: `return { ...base, ...blocks.get(meeting.id)!, canSubmitSignedReport: canApplicantSubmitSignedReport(meeting, closed()) };`
- add `import { canApplicantSubmitSignedReport } from './meeting-confirmation.js';`.

- [ ] **Step 4: Extend the DB test with the read models**

In `meeting-signed-report.db.test.ts`:
- add `let bundles: typeof import('./bundle-meeting.js');` and `let appDb: (typeof import('../../shared/db/index.js'))['db'];`;
- in `before`: `bundles = await import('./bundle-meeting.js');` and, right after the existing `const dbModule = await import(...)` line, `appDb = dbModule.db;`;
- append inside the applicant `describe`:

```ts
    it('read models: applicant detail, Mes réunions and the bundle expose both files and the upload flag', async () => {
      const { d, id, dn } = await heldWithReport();
      const actor = { applicant: { applicantId: d.applicant } };
      const initial = (await meetings.getMeeting(id, actor)) as { canSubmitSignedReport: boolean; signedCrDocumentUrl: string | null };
      assert.equal(initial.canSubmitSignedReport, true);
      assert.equal(initial.signedCrDocumentUrl, null);

      const copy = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, copy);

      const detail = (await meetings.getMeeting(id, actor)) as Record<string, unknown>;
      assert.equal(detail.crDocumentUrl, dn.fileUrl);
      assert.equal(detail.signedCrDocumentUrl, copy.fileUrl);
      assert.equal(detail.canSubmitSignedReport, true, 'replacement allowed while open');
      assert.equal('dnAgentId' in detail, false);

      const item = (await meetings.listApplicantMeetings(d.applicant)).find((m) => m.id === id)!;
      assert.equal(item.signedCrDocumentUrl, copy.fileUrl);
      assert.equal(typeof item.crUploadedAt, 'string');
      assert.equal(item.canSubmitSignedReport, true);

      const { meetings: meetingsTable } = await import('../../shared/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const [meetingRow] = await appDb.select().from(meetingsTable).where(eq(meetingsTable.id, id));
      const applicantBundle = (await bundles.toBundleMeeting(meetingRow, d.request, 'applicant')) as Record<string, unknown>;
      assert.equal(applicantBundle.signedCrDocumentUrl, copy.fileUrl);
      assert.equal(applicantBundle.canSubmitSignedReport, true);
      const staffBundle = (await bundles.toBundleMeeting(meetingRow, d.request, 'staff')) as Record<string, unknown>;
      assert.equal(staffBundle.signedCrDocumentUrl, copy.fileUrl);
      assert.equal('canSubmitSignedReport' in staffBundle, false);

      const staff = (await meetings.getMeeting(id, { user: { roles: ['dn_agent'] } })) as Record<string, unknown>;
      assert.equal(staff.signedCrDocumentUrl, copy.fileUrl);
    });

    it('closed dossier in Mes réunions: files still listed, canSubmitSignedReport false', async () => {
      const { d, id } = await heldWithReport();
      await signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant }));
      await pool.query(`UPDATE requests SET status = 'completed' WHERE id = $1`, [d.request]);
      const item = (await meetings.listApplicantMeetings(d.applicant)).find((m) => m.id === id)!;
      assert.notEqual(item.signedCrDocumentUrl, null);
      assert.notEqual(item.crDocumentUrl, null);
      assert.equal(item.canSubmitSignedReport, false);
    });
```

- [ ] **Step 5: Run the API tests and typecheck**

Run:
- `cd apps/api && npx tsx --test src/modules/meetings/*.test.ts`
- `npm run typecheck --workspace=apps/api`

Expected: PASS. If the typecheck flags another fixture typed `MeetingRow` / `MeetingView` lacking the two signed fields, add `signedCrDocumentUrl: null, signedCrUploadedAt: null` to it (for example in seed scripts: `scripts/seed-analytics-demo-data.ts` inserts may need nothing because the columns are nullable).

---

### Task 6: Portal — `MeetingReportPanel`

**Files:**
- Modify: `apps/portal/src/lib/api/meetings.api.ts`, `apps/portal/src/lib/api/requests.types.ts`
- Create: `apps/portal/src/components/meetings/MeetingReportPanel.tsx`
- Create: `apps/portal/src/components/meetings/MeetingReportPanel.test.tsx`
- Modify: `apps/portal/src/components/request/MeetingDetails.tsx`, `apps/portal/src/components/meetings/MeetingItems.tsx`
- Modify: `apps/portal/src/pages/requests/components/PreliminaryPhaseSection.tsx:184-192`, `apps/portal/src/pages/requests/components/FormalPhaseSection.tsx:259-271`
- Modify fixtures: `apps/portal/src/components/meetings/MeetingConfirmationPanel.test.tsx`, `apps/portal/src/lib/meetings.test.ts`, `apps/portal/src/pages/meetings/MeetingsPage.test.tsx`, `apps/portal/src/pages/requests/components/DossierView.test.tsx`

**Interfaces:**
- Consumes: API fields from Task 5; route `POST /meetings/:id/signed-report` with body `{ uploadAssetId }` (Task 4); `uploadFile(file): Promise<UploadedAsset>` from `lib/uploads.ts` (`.uploadAssetId`).
- Produces:
  - `MeetingReportBlock`;
  - `submitSignedMeetingReport(meetingId, uploadAssetId)`;
  - `<MeetingReportPanel meeting={ReportableMeeting} />`;
  - `showsReportPanel(meeting: { status: string; meetingType?: string }): boolean`.

- [ ] **Step 1: Add the API client types and call**

In `apps/portal/src/lib/api/meetings.api.ts`, add after `MeetingConfirmationBlock`:

```ts
/** SESSION1-MEET-2 - the DN compte-rendu and your signed return (M3/M4). */
export interface MeetingReportBlock {
  crDocumentUrl: string | null;
  crUploadedAt: string | null;
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: string | null;
  /** Held M3/M4 meeting, DN CR available, dossier open (decided by the API). */
  canSubmitSignedReport: boolean;
}
```

Then:
- change `export interface ApplicantMeeting extends MeetingConfirmationBlock {` to `export interface ApplicantMeeting extends MeetingConfirmationBlock, MeetingReportBlock {`;
- delete its own `crDocumentUrl: string | null;` line;
- append:

```ts
/** SESSION1-MEET-2 - first signed copy or replacement; send only the upload id. */
export async function submitSignedMeetingReport(meetingId: number, uploadAssetId: number): Promise<void> {
  await api.post(`/meetings/${meetingId}/signed-report`, { uploadAssetId });
}
```

In `apps/portal/src/lib/api/requests.types.ts`:
- change the import to `import type { MeetingConfirmationBlock, MeetingReportBlock } from './meetings.api';`;
- `PreliminaryBundle.meeting`: `({ id: number; scheduledAt: string; location: string | null; status: string } & MeetingConfirmationBlock & MeetingReportBlock) | null;`
- `FormalBundle.meeting`: the same shape.

- [ ] **Step 2: Write the failing component tests**

Create `apps/portal/src/components/meetings/MeetingReportPanel.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { renderWithProviders } from '../../test/render';
import { MeetingReportPanel, showsReportPanel, type ReportableMeeting } from './MeetingReportPanel';

const base: ReportableMeeting = {
  id: 21,
  status: 'held',
  meetingType: 'preliminary',
  crDocumentUrl: '/api/files/101',
  crUploadedAt: '2026-10-10T08:00:00.000Z',
  signedCrDocumentUrl: null,
  signedCrUploadedAt: null,
  canSubmitSignedReport: true,
};
const pdf = () => new File(['%PDF'], 'cr-signe.pdf', { type: 'application/pdf' });

let post: ReturnType<typeof vi.fn>;
beforeEach(() => {
  post = vi.fn((url: string) => Promise.resolve({ data: url === '/uploads' ? { uploadAssetId: 55 } : {} }));
  vi.spyOn(api, 'post').mockImplementation(post);
  vi.spyOn(notify, 'success').mockImplementation(() => undefined as never);
  vi.spyOn(notify, 'error').mockImplementation(() => undefined as never);
});
afterEach(() => vi.restoreAllMocks());

describe('<MeetingReportPanel>', () => {
  it('no DN CR yet: says so, no action', () => {
    renderWithProviders(<MeetingReportPanel meeting={{ ...base, crDocumentUrl: null, crUploadedAt: null, canSubmitSignedReport: false }} />);
    const panel = screen.getByRole('region', { name: 'Compte rendu de réunion' });
    expect(panel).toHaveTextContent("Le compte rendu n'est pas encore disponible.");
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
  });

  it('DN CR available: visible consult / download buttons, then the deposit call to action', () => {
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    expect(screen.getByText('Compte rendu transmis par la DN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consulter le compte rendu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
    expect(screen.getByText('Après signature, téléversez le compte rendu signé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déposer le compte rendu signé' })).toBeInTheDocument();
  });

  it('uploads the file, then sends only its id to the applicant route', async () => {
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    await userEvent.upload(screen.getByLabelText('Fichier du compte rendu signé'), pdf());
    await waitFor(() => expect(post).toHaveBeenCalledWith('/meetings/21/signed-report', { uploadAssetId: 55 }));
    expect(post.mock.calls[0][0]).toBe('/uploads');
    expect(notify.success).toHaveBeenCalledWith('Compte rendu signé transmis à la DN.');
  });

  it('attach refused after the upload: API message shown, no success, button usable again', async () => {
    post.mockImplementation((url: string) =>
      url === '/uploads'
        ? Promise.resolve({ data: { uploadAssetId: 55 } })
        : Promise.reject({ isAxiosError: true, response: { status: 409, data: { message: 'Dossier clos.' } } })
    );
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    await userEvent.upload(screen.getByLabelText('Fichier du compte rendu signé'), pdf());
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(notify.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Déposer le compte rendu signé' })).toBeEnabled();
  });

  it('while an upload runs, the deposit button is disabled (no double submit)', async () => {
    post.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    await userEvent.upload(screen.getByLabelText('Fichier du compte rendu signé'), pdf());
    expect(screen.getByRole('button', { name: 'Déposer le compte rendu signé' })).toBeDisabled();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('signed copy sent: date, consult / download, replacement allowed', () => {
    renderWithProviders(
      <MeetingReportPanel meeting={{ ...base, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: '2026-10-12T09:30:00.000Z' }} />
    );
    expect(screen.getByText('Compte rendu signé transmis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remplacer le fichier signé' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Consulter' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Déposer le compte rendu signé' })).not.toBeInTheDocument();
  });

  it('closed dossier: documents still readable, no upload or replace', () => {
    renderWithProviders(
      <MeetingReportPanel
        meeting={{ ...base, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: '2026-10-12T09:30:00.000Z', canSubmitSignedReport: false }}
      />
    );
    expect(screen.getByRole('button', { name: 'Consulter le compte rendu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remplacer le fichier signé' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fichier du compte rendu signé')).not.toBeInTheDocument();
  });

  it('showsReportPanel: held M3/M4 only', () => {
    expect(showsReportPanel({ status: 'held', meetingType: 'preliminary' })).toBe(true);
    expect(showsReportPanel({ status: 'held', meetingType: 'formal' })).toBe(true);
    expect(showsReportPanel({ status: 'held' })).toBe(true);
    for (const status of ['scheduled', 'no_show', 'rescheduled', 'file_cancelled']) {
      expect(showsReportPanel({ status, meetingType: 'preliminary' })).toBe(false);
    }
    expect(showsReportPanel({ status: 'held', meetingType: 'site_visit' })).toBe(false);
  });
});
```

Run: `npm run test --workspace=apps/portal -- MeetingReportPanel`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the component**

Create `apps/portal/src/components/meetings/MeetingReportPanel.tsx`:

```tsx
import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileCheck2, FileText } from 'lucide-react';
import FileLink from '../files/FileLink';
import { DOCUMENT_ACCEPT } from '../files/FileDropzone';
import { apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { uploadFile } from '../../lib/uploads';
import { formatDate, formatDateTime } from '../../lib/format';
import { submitSignedMeetingReport, type MeetingReportBlock } from '../../lib/api/meetings.api';
import { queryKeys } from '../../lib/react-query/queryKeys';

/** SESSION1-MEET-2 - the DN compte-rendu of a held M3/M4 meeting and your
 *  signed return. Visible buttons, never a bare text link. Whether you may
 *  upload is decided by the API (canSubmitSignedReport). */

export type ReportableMeeting = MeetingReportBlock & { id: number; status: string; meetingType?: string };

/** Held meeting, never a site visit (M6 has no compte-rendu). */
export function showsReportPanel(meeting: { status: string; meetingType?: string }): boolean {
  return meeting.status === 'held' && meeting.meetingType !== 'site_visit';
}

const ACTION = 'btn-secondary rounded px-3 py-1.5 text-xs no-underline';

export function MeetingReportPanel({ meeting }: { meeting: ReportableMeeting }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const signed = meeting.signedCrDocumentUrl;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file);
      await submitSignedMeetingReport(meeting.id, uploaded.uploadAssetId);
      notify.success('Compte rendu signé transmis à la DN.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.requests.all() }),
      ]);
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de transmettre le compte rendu signé.'));
    } finally {
      setBusy(false);
    }
  }

  const pick = () => inputRef.current?.click();

  if (!meeting.crDocumentUrl) {
    return (
      <div className="mt-3 rounded-lg border border-anac-border bg-white p-3" role="region" aria-label="Compte rendu de réunion">
        <p className="text-sm font-semibold text-anac-navy">Compte rendu de réunion</p>
        <p className="mt-1 text-sm text-anac-muted">Le compte rendu n&apos;est pas encore disponible.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3" role="region" aria-label="Compte rendu de réunion">
      <div className="rounded-lg border border-anac-border bg-white p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-navy">
          <FileText size={16} className="text-anac-blue" aria-hidden="true" /> Compte rendu transmis par la DN
        </p>
        {meeting.crUploadedAt && <p className="text-xs text-anac-muted">Déposé le {formatDate(meeting.crUploadedAt)}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <FileLink address={meeting.crDocumentUrl} className={ACTION}>
            Consulter le compte rendu
          </FileLink>
          <FileLink address={meeting.crDocumentUrl} download className={ACTION}>
            Télécharger
          </FileLink>
        </div>
      </div>

      {signed ? (
        <div className="rounded-lg border border-anac-success/30 bg-anac-success/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-success">
            <FileCheck2 size={16} aria-hidden="true" /> Compte rendu signé transmis
          </p>
          {meeting.signedCrUploadedAt && (
            <p className="text-xs text-anac-muted">Le {formatDateTime(meeting.signedCrUploadedAt)}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <FileLink address={signed} className={ACTION}>
              Consulter
            </FileLink>
            <FileLink address={signed} download className={ACTION}>
              Télécharger
            </FileLink>
            {meeting.canSubmitSignedReport && (
              <button type="button" className={ACTION} onClick={pick} disabled={busy}>
                Remplacer le fichier signé
              </button>
            )}
          </div>
        </div>
      ) : meeting.canSubmitSignedReport ? (
        <div className="rounded-lg border border-anac-warning/40 bg-anac-warning/5 p-3">
          <p className="text-sm text-anac-text">Après signature, téléversez le compte rendu signé.</p>
          <button type="button" className="btn-primary mt-2 rounded px-3 py-1.5 text-xs" onClick={pick} disabled={busy}>
            Déposer le compte rendu signé
          </button>
        </div>
      ) : null}

      {meeting.canSubmitSignedReport && (
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          aria-label="Fichier du compte rendu signé"
          accept={DOCUMENT_ACCEPT}
          onChange={handleFile}
          disabled={busy}
        />
      )}
    </div>
  );
}
```

If `formatDate` is not exported by `apps/portal/src/lib/format.ts` (`PreliminaryPhaseSection` imports it from there, so it should be), use `formatDateTime` for both.

- [ ] **Step 4: Run the component tests**

Run: `npm run test --workspace=apps/portal -- MeetingReportPanel`
Expected: PASS.

- [ ] **Step 5: Integrate, and remove the weak links**

`apps/portal/src/components/request/MeetingDetails.tsx`:
- delete the `{meeting.crDocumentUrl && ( <FileLink ...>Consulter le compte-rendu</FileLink> )}` block;
- delete the `crDocumentUrl?: string | null;` prop and the now-unused `FileLink` import;
- M6 site visits keep using this component; they have no compte-rendu.

`PreliminaryPhaseSection.tsx`:
- import `{ MeetingReportPanel, showsReportPanel } from '../../../components/meetings/MeetingReportPanel'`;
- in the « Réunion préliminaire » `SectionCard`, right after the closing `)}` of the `!meeting ? ... : usesConfirmationPanel(meeting) ? ... : <MeetingDetails .../>` ternary, add:

```tsx
          {meeting && showsReportPanel({ ...meeting, meetingType: 'preliminary' }) && <MeetingReportPanel meeting={meeting} />}
```

`FormalPhaseSection.tsx`: same import, and after the « Réunion formelle » ternary:

```tsx
          {bundle.meeting && showsReportPanel({ ...bundle.meeting, meetingType: 'formal' }) && (
            <MeetingReportPanel meeting={bundle.meeting} />
          )}
```

`MeetingItems.tsx` (`MeetingHistoryRow`):
- delete the `{meeting.crDocumentUrl && ( <> {' · '} <FileLink ...>compte-rendu</FileLink> </> )}` fragment, and the `FileLink` import if unused;
- import `{ MeetingReportPanel, showsReportPanel } from './MeetingReportPanel'`;
- add as the last child of the `<li>`, after the status `<span>`:

```tsx
      {showsReportPanel(meeting) && (
        <div className="basis-full">
          <MeetingReportPanel meeting={meeting} />
        </div>
      )}
```

- [ ] **Step 6: Update the fixtures and the old assertion**

Add `crUploadedAt: null, signedCrDocumentUrl: null, signedCrUploadedAt: null, canSubmitSignedReport: false,` (skip keys already present) to the meeting fixtures in:
- `MeetingConfirmationPanel.test.tsx` (line ~116);
- `lib/meetings.test.ts` (line ~17);
- `pages/meetings/MeetingsPage.test.tsx` (the `meeting()` factory, line ~15);
- `pages/requests/components/DossierView.test.tsx` (line ~18; `crUploadedAt` is already there).

In `pages/meetings/MeetingsPage.test.tsx`, the held row (`crDocumentUrl: '/api/files/7'`) now carries the panel. Replace:

```ts
    expect(within(rows[2]).getByText('compte-rendu')).toBeInTheDocument();
```

with:

```ts
    expect(within(rows[2]).getByRole('button', { name: 'Consulter le compte rendu' })).toBeInTheDocument();
```

- [ ] **Step 7: Run the portal suite and typecheck**

Run: `npm run test --workspace=apps/portal` and `npm run typecheck --workspace=apps/portal`
Expected: PASS; 106 existing tests plus the new ones.

---

### Task 7: Admin — `MeetingReportRows` (M3 card, M4 card, Réunions detail)

**Files:**
- Modify: `apps/admin/src/lib/api/meetings.types.ts:72-73`, `apps/admin/src/lib/api/preliminary.types.ts:17-18`, `apps/admin/src/lib/api/formal.types.ts:31-32`
- Create: `apps/admin/src/components/meetings/MeetingReportRows.tsx`
- Create: `apps/admin/src/components/meetings/MeetingReportRows.test.tsx`
- Modify: `apps/admin/src/pages/phases/preliminary/components/MeetingCard.tsx`, `apps/admin/src/pages/phases/formal/components/FormalMeetingCard.tsx`, `apps/admin/src/pages/meetings/MeetingsPage.tsx:690-760,885-925`
- Modify tests: `apps/admin/src/pages/closed-dossier-lists.test.tsx`, `apps/admin/src/pages/phases/preliminary/helpers.test.ts`

**Interfaces:**
- Consumes: `signedCrDocumentUrl`, `signedCrUploadedAt` (strings over JSON) on the M3/M4 bundle meetings and cockpit items (Task 5). The DN error `MEETING_REPORT_FROZEN_SIGNED` is reported through the existing `setActionError` paths.
- Produces: `<MeetingReportRows title report canUpload busy onUpload />`.

- [ ] **Step 1: Extend the admin types**

Add after `crUploadedAt: string | null;` in each of `MeetingCockpitItem` (`lib/api/meetings.types.ts`), `MeetingView` (`lib/api/preliminary.types.ts`) and `FormalMeetingView` (`lib/api/formal.types.ts`):

```ts
  /** SESSION1-MEET-2 - the applicant's signed return of the CR. */
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: string | null;
```

- [ ] **Step 2: Write the failing component tests**

Create `apps/admin/src/components/meetings/MeetingReportRows.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { MeetingReportRows, type MeetingReportFiles } from './MeetingReportRows';

const none: MeetingReportFiles = { crDocumentUrl: null, crUploadedAt: null, signedCrDocumentUrl: null, signedCrUploadedAt: null };
const available: MeetingReportFiles = { ...none, crDocumentUrl: '/api/files/101', crUploadedAt: '2026-10-10T08:00:00.000Z' };
const received: MeetingReportFiles = { ...available, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: '2026-10-12T09:30:00.000Z' };
const FROZEN = 'Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant.';

const rows = (report: MeetingReportFiles, extra: Partial<Parameters<typeof MeetingReportRows>[0]> = {}) =>
  renderWithProviders(<MeetingReportRows title="Réunion préliminaire" report={report} canUpload {...extra} />);

describe('<MeetingReportRows>', () => {
  it('no DN CR: « Non déposé », deposit form, no signed row', () => {
    rows(none);
    const dn = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(dn).toHaveTextContent('Non déposé');
    expect(within(dn).getByRole('button', { name: /Déposer le compte rendu/ })).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'Compte rendu signé par le postulant' })).not.toBeInTheDocument();
  });

  it('DN CR available, signed copy pending: replace allowed, « En attente du postulant », no validation action', () => {
    rows(available);
    const dn = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(dn).toHaveTextContent('Disponible');
    expect(within(dn).getByRole('button', { name: 'Consulter' })).toBeInTheDocument();
    expect(within(dn).getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
    expect(within(dn).getByRole('button', { name: /Remplacer le compte rendu/ })).toBeInTheDocument();
    const signed = screen.getByRole('region', { name: 'Compte rendu signé par le postulant' });
    expect(signed).toHaveTextContent('En attente du postulant');
    expect(screen.queryByRole('button', { name: /Valider|Accepter|Refuser|Rejeter/ })).not.toBeInTheDocument();
  });

  it('signed copy received: « Reçu le », consult / download, DN replacement frozen with the exact wording', () => {
    rows(received);
    const signed = screen.getByRole('region', { name: 'Compte rendu signé par le postulant' });
    expect(signed).toHaveTextContent(/Reçu le/);
    expect(within(signed).getByRole('button', { name: 'Consulter' })).toBeInTheDocument();
    expect(within(signed).getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
    const dn = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(dn).toHaveTextContent(FROZEN);
    expect(within(dn).queryByRole('button', { name: /Remplacer le compte rendu/ })).not.toBeInTheDocument();
    expect(within(dn).queryByLabelText('Fichier du compte rendu DN')).not.toBeInTheDocument();
  });

  it('read only (closed dossier): files viewable, no form, no frozen note', () => {
    rows(received, { canUpload: false });
    expect(screen.queryByLabelText('Fichier du compte rendu DN')).not.toBeInTheDocument();
    expect(screen.queryByText(FROZEN)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Consulter' })).toHaveLength(2);
  });

  it('sends the chosen file and clears it on success; keeps it when the caller reports a failure', async () => {
    const onUpload = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    rows(available, { onUpload });
    const input = screen.getByLabelText('Fichier du compte rendu DN') as HTMLInputElement;
    const file = new File(['%PDF'], 'cr.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    const submit = screen.getByRole('button', { name: /Remplacer le compte rendu/ });
    fireEvent.click(submit);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(submit).toBeDisabled());
  });
});
```

Run: `npm run test --workspace=apps/admin -- MeetingReportRows`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the component**

Create `apps/admin/src/components/meetings/MeetingReportRows.tsx`:

```tsx
import { useRef, useState } from 'react';
import { FileCheck2, FileText, Upload } from 'lucide-react';
import DocumentPreviewLink from '../documents/DocumentPreviewLink';
import FileLink from '../files/FileLink';
import { Button } from '../ui/button';

/** SESSION1-MEET-2 - the two compte-rendu files of a held M3/M4 meeting, in
 *  two separate rows: the DN original (upload / replace until the applicant
 *  returns a signed copy) and the applicant's signed return (read only - no
 *  validation step exists). */

export interface MeetingReportFiles {
  crDocumentUrl: string | null;
  crUploadedAt: string | null;
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: string | null;
}

interface MeetingReportRowsProps {
  /** Meeting label, used as the document viewer title. */
  title: string;
  report: MeetingReportFiles;
  /** DN may upload now: open dossier, held meeting, managing role. */
  canUpload: boolean;
  busy?: boolean;
  /** Resolves false (or rejects) when the caller already reported an error. */
  onUpload?: (file: File) => Promise<unknown>;
}

const FROZEN =
  'Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant.';
const LINK = 'rounded border border-anac-border px-2 py-1 text-xs font-medium text-anac-blue hover:bg-anac-gray';

function frDate(value: string | null, withTime = false): string {
  if (!value) return '';
  const date = new Date(value);
  return withTime
    ? date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : date.toLocaleDateString('fr-FR');
}

function Badge({ tone, children }: { tone: 'muted' | 'info' | 'success'; children: string }) {
  const tones = {
    muted: 'bg-slate-100 text-slate-600',
    info: 'bg-anac-info/10 text-anac-info',
    success: 'bg-anac-success/10 text-anac-success',
  };
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function MeetingReportRows({ title, report, canUpload, busy = false, onUpload }: MeetingReportRowsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const { crDocumentUrl, signedCrDocumentUrl } = report;

  async function submit() {
    if (!file || !onUpload) return;
    setSending(true);
    try {
      const result = await onUpload(file);
      if (result !== false) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch {
      // The caller already shows the API message (setActionError).
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <section aria-label="Compte rendu DN" className="rounded-lg border border-anac-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-anac-navy">
            <FileText size={14} aria-hidden="true" /> Compte rendu DN
          </p>
          <Badge tone={crDocumentUrl ? 'info' : 'muted'}>{crDocumentUrl ? 'Disponible' : 'Non déposé'}</Badge>
        </div>
        {crDocumentUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-anac-muted">Déposé le {frDate(report.crUploadedAt)}</span>
            <DocumentPreviewLink title={`Compte rendu - ${title}`} url={crDocumentUrl} label="Consulter" className={LINK} />
            <FileLink address={crDocumentUrl} download className={LINK}>
              Télécharger
            </FileLink>
          </div>
        )}
        {canUpload && signedCrDocumentUrl && <p className="mt-2 text-xs text-anac-muted">{FROZEN}</p>}
        {canUpload && !signedCrDocumentUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              aria-label="Fichier du compte rendu DN"
              className="text-xs"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button size="sm" variant="secondary" className="gap-1" onClick={submit} disabled={!file || busy || sending}>
              <Upload size={12} aria-hidden="true" />
              {crDocumentUrl ? 'Remplacer le compte rendu' : 'Déposer le compte rendu'}
            </Button>
          </div>
        )}
        <p className="mt-1 text-[11px] text-anac-muted">Facultatif : la phase peut être clôturée sans compte rendu.</p>
      </section>

      {crDocumentUrl && (
        <section aria-label="Compte rendu signé par le postulant" className="rounded-lg border border-anac-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-anac-navy">
              <FileCheck2 size={14} aria-hidden="true" /> Compte rendu signé par le postulant
            </p>
            {signedCrDocumentUrl ? (
              <Badge tone="success">{`Reçu le ${frDate(report.signedCrUploadedAt, true)}`}</Badge>
            ) : (
              <Badge tone="muted">En attente du postulant</Badge>
            )}
          </div>
          {signedCrDocumentUrl && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DocumentPreviewLink title={`Compte rendu signé - ${title}`} url={signedCrDocumentUrl} label="Consulter" className={LINK} />
              <FileLink address={signedCrDocumentUrl} download className={LINK}>
                Télécharger
              </FileLink>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

Check that the admin `FileLink` lives at `apps/admin/src/components/files/FileLink.tsx` (`MeetingsPage` imports it). If the import path differs, use the path `MeetingsPage.tsx` uses.

- [ ] **Step 4: Run the component tests**

Run: `npm run test --workspace=apps/admin -- MeetingReportRows`
Expected: PASS.

- [ ] **Step 5: Integrate in the M3 card**

In `apps/admin/src/pages/phases/preliminary/components/MeetingCard.tsx`:

1. Import `{ MeetingReportRows } from '../../../../components/meetings/MeetingReportRows'`.
2. Read-only branch: replace the `{meeting.crDocumentUrl && ( <p className="text-sm"> Compte-rendu envoyé le ... </p> )}` block with:

```tsx
            {meeting.status === 'held' && (
              <MeetingReportRows title="Réunion préliminaire" report={meeting} canUpload={false} />
            )}
```

3. Editable branch: replace the whole `{meeting.status === 'held' && ( <div className="pt-1 space-y-2"> ... </div> )}` block with:

```tsx
          {meeting.status === 'held' && (
            <MeetingReportRows
              title="Réunion préliminaire"
              report={meeting}
              canUpload
              busy={busy}
              onUpload={(file) => sendReport(meeting.id, file)}
            />
          )}
```

4. Delete `sendingReport`, `reportFile`, `handleSendReport`, and the imports that become unused (`FileUp`, `DocumentPreviewLink`, `formatDate`); the lint and typecheck list them.

- [ ] **Step 6: Integrate in the M4 card**

In `apps/admin/src/pages/phases/formal/components/FormalMeetingCard.tsx`, make the same two replacements with `title="Réunion formelle"`. In the editable branch:
- use `canUpload={canManage}`;
- keep `busy={busy}` and `onUpload={(file) => sendReport(meeting.id, file)}`;
- delete the old block including its « Le compte-rendu est facultatif pour la clôture de la phase. » paragraph (the component carries the « Facultatif » note);
- remove the now-unused state, handler and imports.

- [ ] **Step 7: Integrate in the Réunions detail**

In `apps/admin/src/pages/meetings/MeetingsPage.tsx`, in the detail component (around lines 680-925):

1. Import `{ MeetingReportRows } from '../../components/meetings/MeetingReportRows'`.
2. Delete `const [reportFile, setReportFile] = useState<File | null>(null);`, `handleReport`, and `setReportFile(null);` inside `reportMutation.onSuccess`.
3. Replace the `{canReport ? ( <form onSubmit={handleReport} ...> ... </form> ) : null}` block with:

```tsx
            {item.meetingType !== 'site_visit' && item.status === 'held' ? (
              <MeetingReportRows
                title={`${item.meetingTypeLabel} - ${item.requestReference}`}
                report={item}
                canUpload={canReport}
                busy={busy}
                onUpload={(file) => reportMutation.mutateAsync({ id: item.id, file })}
              />
            ) : null}
```

4. In the `item.dossierClosed` block, delete the `{item.crDocumentUrl ? ( <FileLink ...>Consulter le compte-rendu</FileLink> ) : null}` part; the rows above already show the files read only. Keep the « Dossier clos : la réunion reste consultable, aucune action n'est possible. » sentence.
5. Remove imports that become unused (`FormEvent`, `Upload`), as the lint reports.

- [ ] **Step 8: Update the existing admin tests**

In `apps/admin/src/pages/closed-dossier-lists.test.tsx`:
- in the `meeting()` factory, add `signedCrDocumentUrl: null, signedCrUploadedAt: null,` after `crUploadedAt: AT,`, and change `crDocumentUrl: '/api/files/cr.pdf'` to `crDocumentUrl: '/api/files/41'`;
- closed test: replace the two report assertions with:

```ts
    const dnReport = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(within(dnReport).getByRole('button', { name: 'Consulter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remplacer le compte rendu/ })).not.toBeInTheDocument();
```

- open test: replace `expect(screen.getByText('Remplacer le compte-rendu')).toBeInTheDocument();` with:

```ts
    expect(screen.getByRole('button', { name: /Remplacer le compte rendu/ })).toBeInTheDocument();
```

- add `within` to the `@testing-library/react` import if missing;
- add this test to the `<MeetingsPage> (K7c)` describe:

```ts
  it('SESSION1-MEET-2 - a held site visit shows no compte-rendu rows', async () => {
    responses['/meetings'] = cockpit(
      meeting({ meetingType: 'site_visit', meetingTypeLabel: 'Visite sur site', phaseCode: 'M6', canManage: false, crDocumentUrl: null, crUploadedAt: null })
    );
    renderWithProviders(<MeetingsPage />);
    fireEvent.click(await screen.findByText('Liste'));
    fireEvent.click(await screen.findByText('DEM-K7C-01'));
    expect(screen.queryByRole('region', { name: 'Compte rendu DN' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Compte rendu signé par le postulant' })).not.toBeInTheDocument();
  });
```

In `apps/admin/src/pages/phases/preliminary/helpers.test.ts`, add `signedCrDocumentUrl: null, signedCrUploadedAt: null,` next to `crUploadedAt: null`. Fix any other fixture the typecheck flags the same way.

- [ ] **Step 9: Run the admin suite, typecheck and lint**

Run:
- `npm run test --workspace=apps/admin`
- `npm run typecheck --workspace=apps/admin`
- `npm run lint --workspace=apps/admin --if-present`

Expected: PASS; 203 existing tests plus the new ones. `analytics-refresh.test.tsx` still passes, since `sendReport` hooks are unchanged.

---

### Task 8: Docs, full validation, commit

**Files:**
- Modify: `exploration-cache/project/decisions.md` (new #18), `exploration-cache/changelog.md`, `exploration-cache/active-session/current-task.md`, `exploration-cache/project/database-schema.md` (meetings columns, owner type)

- [ ] **Step 1: Write decision #18**

Append to `exploration-cache/project/decisions.md`, following the format of #17:

```markdown
## 18. SESSION1-MEET-2 - signed return of the meeting compte rendu (2026-10-15)

- M3/M4 only; M6 has no DN CR and no signed copy (API guard `acceptsMeetingReport`, DB check for the signed copy).
- Two independent chains on the same meeting id: `meeting_report` (DN, `meetings.cr_document_url`) and `meeting_report_signed` (applicant, `meetings.signed_cr_document_url`).
- The DN CR is frozen once a signed copy exists (409 `MEETING_REPORT_FROZEN_SIGNED`). Exceptional corrections are handled manually outside the workflow until a rectification mechanism is validated.
- The applicant may replace the signed copy while the dossier is open; history in `document_versions`.
- No DN validation, no notification, no cockpit metric; phase closure needs neither file.
- Audit `MEETING_SIGNED_REPORT_SUBMITTED` (applicant actor, `details.replaced`), one activity label.
- Migration 0010: ADD VALUE + two nullable columns + check; no backfill.
```

- [ ] **Step 2: Update the changelog, current task and schema notes**

- **`changelog.md`:** add a dated SESSION1-MEET-2 entry with:
  - the route, the migration and the files touched;
  - the test counts from Step 3;
  - the deploy line: `npm run db:migrate` only.
- **`current-task.md`:** add a top line: « 2026-10-15 SESSION1-MEET-2 (implemented, validated; single feature commit at the end of Task 8): signed CR return … Deploy: `npm run db:migrate` (0010). Deferred: notifications, CR rectification mechanism. »
- **`database-schema.md`:** list the two columns, the check and the owner type.

- [ ] **Step 3: Full validation (record every number)**

Run from the repo root:

```bash
npm run typecheck --workspaces --if-present
npm run test --workspace=apps/api -- --test-concurrency=1
npm run test --workspace=apps/admin
npm run test --workspace=apps/portal
npm run build
npm run lint --workspaces --if-present
npm run db:check:replayable --workspace=apps/api
```

Expected:
- API: all pass except the known K8b Windows `spawn npx ENOENT`.
- Admin and portal: all pass.
- Typecheck, build and lint: clean.
- `db:check:replayable`: OK.

- [ ] **Step 4: Migration replay on a database at 0009 with legacy rows**

On a disposable DB:
1. Migrate to 0009 (check out `2721c0c` for the migrate step, or replay migrations 0000-0009 only).
2. Insert:
   - one held preliminary meeting with `cr_document_url` and a `meeting_report` version;
   - one held meeting without a CR;
   - one site visit.
3. Run `npm run db:migrate --workspace=apps/api`.
4. Expected: success, all rows with null signed fields, check satisfied.

- [ ] **Step 5: Commit after validation**

```bash
git add apps/api apps/admin apps/portal docs/superpowers/specs/2026-10-15-session1-meet-2-design.md docs/superpowers/plans/2026-10-15-session1-meet-2.md exploration-cache/project exploration-cache/changelog.md exploration-cache/active-session/current-task.md
git status   # exploration-cache/reference/* must stay unstaged
git commit -m "$(cat <<'EOF'
feat(meetings): applicant signed return of the M3/M4 meeting report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

`db:check:committed` must pass after the commit. Push only when the user asks.
