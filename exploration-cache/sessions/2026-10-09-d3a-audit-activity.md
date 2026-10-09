# 2026-10-09 - D3a Audit Activity

## Shipped

- Added `audit_logs.request_id` through migration `0005_d3a_audit_request`.
  It is indexed with `created_at` and intentionally has no foreign key so
  audit rows survive dossier deletion/dev resets.
- Added `modules/auth/audit-request.ts` as the single runtime map from audit
  action to entity kind. `logAudit` resolves the request from explicit
  `requestId`, `details.requestId`, or the action entity in the same executor.
- Backfilled historical audit rows in migration 0005 using the same action
  lists as the runtime map. `audit-request.test.ts` asserts the SQL and TS map
  stay in sync.
- Updated the Demandes cockpit to read the latest linked activity across all
  phases, max five events per dossier, and expose `lastActivityAt`.
- Added D3a docs in `docs/TASKS.md` and this exploration-cache changelog.

## Verification

- `git diff --check`
- `npm run typecheck`
- `npx eslint "apps/*/src/**/*.{ts,tsx}" "packages/*/src/**/*.{ts,tsx}"`
  (0 errors, 4 existing hook warnings)
- `npm run test --workspaces --if-present`
  - admin: 171/171
  - API: 316/316, DB-backed suites skipped without `DATABASE_URL`
  - portal: 94/94
- `npm run build`

## Next

- D3b: add `request_views` and per-agent unread state.
- D3c: admin unread presentation, "Derniere activite" sort, and visual
  reading markers.
