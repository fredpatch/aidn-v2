# TEAM-FOUNDATION-1

The dossier owns its certification team independently of meeting responsibility
(`meetings.dnAgentId`). Proposal and final assignment use separate storage:

| Table | Purpose |
| --- | --- |
| `dossier_team_proposals` | One editable proposal per request; proposed approval number and original proposer/date |
| `dossier_team_proposal_members` | Proposed internal user identities |
| `dossier_teams` | One final assignment per request; validated approval number and finalizer/date |
| `dossier_team_members` | Assigned internal user identities |

Membership is unique per header/user. Both headers reference the request with
`ON DELETE CASCADE`, and membership cascades from its header. The existing dev
request reset uses `TRUNCATE ... CASCADE`; demo request deletion and a full DB
reset therefore need no additional cleanup ordering. Users remain protected by
foreign keys. Request uniqueness provides the request lookup indexes; member
indexes cover user lookups. Approval numbers have a 100-character limit and
nonblank checks, with no global uniqueness or numbering format rule.

## Staff API

| Endpoint | Roles |
| --- | --- |
| `GET /api/requests/:requestId/team` | `dn_agent`, `dn_supervisor`, `SU` |
| `GET /api/dossier-teams/eligible-members` | `dn_agent`, `dn_supervisor`, `SU` |
| `PUT /api/requests/:requestId/team-proposal` | `dn_supervisor`, `SU` |

The command takes `{ memberIds: number[], proposedApprovalNumber: string }`.
It rejects empty/duplicate/invalid IDs, blank or overlong numbers, and any member
who is absent, inactive, or lacks both DN roles. Multi-role members appear once;
`SU` alone confers no membership eligibility. Numbers are trimmed without format
validation. Member reads return only `id`, `fullName`, and `employeeCode`.

Saving locks the request and existing M3 phase, requires an open dossier and open
M3, validates members, inserts/updates the proposal, replaces membership and
writes the audit in one transaction. Request locking serializes concurrent first
saves and edits; phase locking protects against concurrent closure. User share
locks protect active status. Qualifying roles are read without row locks to
avoid inversion against existing role replacement (which deletes roles before
updating the user). Separate reads use a repeatable-read snapshot so a concurrent
save cannot mix a header with another membership set.

Edits retain the original `proposedBy`/`proposedAt`; `updatedAt` and the audit
identify subsequent changes. `DOSSIER_TEAM_PROPOSAL_CREATED` and
`DOSSIER_TEAM_PROPOSAL_UPDATED` carry explicit request and actor IDs, prior/new
member IDs and prior/new proposed numbers. Their French activity labels come
from the existing central catalog. Authorized reads remain available after
dossier closure; writes return `DOSSIER_CLOSED`.

## Preliminary UI and finalization boundary

Open M3 displays the French proposal card with members, proposed number and last
update. Supervisors/SU can edit through the existing modal component, searching
DN identities by name or employee code and selecting multiple members. Agents
read only. Closed dossiers offer no mutation. Formerly eligible members remain
visible in the editor for removal, while server validation prevents saving them.

The proposal is working data, not official assignment. No command, route or CTA
creates a final team or copies the proposed number into the validated field.
The read API supports separately seeded final teams. `LEGAL-DECISION-1` must
introduce finalization with actual Decision evidence and authorization.

The number lifecycle is `proposal.proposedApprovalNumber` (working proposal),
then `team.approvalNumber` (validated dossier number). Delivery V2 must later
reconcile the legacy `certificates.approvalReferenceNumber` with
`dossier_teams.approval_number`. This task preserves certificate field editing,
template data and PDF generation behavior; it performs no certificate migration.

Migration: `0013_team_foundation_1.sql`, generated Drizzle snapshot and journal.
Fresh-database migration and no-drift generation are verified.

## Scope exclusions

- Direction Juridique implementation: none
- CI validation workflow: none
- Preliminary V2 workflow gates: none
- final team production action: none
- certificate approval-number migration: none
- Portal changes: none

M3 readiness/closure, next actions, meetings, pre-evaluation submission, DG and
Directeur DN circuits, Finance, M4/M5, Inspection and Delivery keep their current
behavior. Team presence adds no workflow gate.

## Verification and review

- API full suite, serial execution against a freshly migrated disposable local
  PostgreSQL database: **950/950**, no skips (baseline 932; 18 added cases).
- Admin full suite: **496/496** (baseline 484; 12 added cases).
- Shared/API/admin typecheck: passed.
- Full shared/API/admin/portal build: passed. Vite reports its existing bundle
  size advisory; React Router test warnings remain unchanged.
- Targeted ESLint and `git diff --check`: passed.
- Migration committed-state check: 14 SQL files / 14 journal entries; passed.
- Migration replayability check: generation succeeds with 14 files before/after,
  no schema drift. Migration applied successfully on a new database.
- Portal source unchanged; its tests were not rerun.

Coverage includes proposal create/update and all validation refusals, safe reads,
multi-role eligibility, HTTP permissions and successful supervisor/SU commands,
closed dossier reads/write refusal, missing/closed M3, rollback after an audit
failure, concurrent saves, final-team reads, FK cleanup and uniqueness, audit
attribution/history, French activity labels, card interaction and page visibility.
The certificate regression exercises both `updateCertificateFields()` and the
real generation service with only the external browser replaced; template data,
file registration, version persistence and audit still execute normally.

Independent review found one lock inversion against role replacement. Removing
the qualifying-role row lock resolved it without changing user administration.
The concurrency regression was verified to fail with the old locking and pass
with the correction. Follow-up review reports no remaining findings.

The first full API run exposed a test-fixture requirement (an existing actor
with ID 1), resolved in the disposable DB setup; the final serial run above is
fully green. No existing development database was migrated or reset.
