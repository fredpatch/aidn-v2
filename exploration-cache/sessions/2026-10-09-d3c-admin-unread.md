# 2026-10-09 - D3c Admin Unread

## Shipped

- Added the `Non lues` tab in the Demandes cockpit as a cross-cutting view.
  Closed dossiers are never included.
- Default sort is now `Derniere activite`, using `lastActivityAt` for sorting,
  grouping, and row dates. Deposit-date sorts still use `createdAt`.
- Unread rows show a blue dot, bold organization/date, and screen-reader text.
- The selected dossier is marked read after one second in the reading pane.
  Fast keyboard navigation does not mark intermediate rows read.
- Added row flags from existing cockpit data: pending documents to review and
  signed-return/preliminary-phase cue. Closed dossiers show no flags.
- The reading pane now displays `Derniere activite`.

## Verification

- `git diff --check`
- `npm run typecheck`
- `npx eslint "apps/*/src/**/*.{ts,tsx}" "packages/*/src/**/*.{ts,tsx}"`
  (0 errors, 4 existing hook warnings)
- `npm run build`
- `npm run test --workspaces --if-present`
  - admin: 176/176
  - API: 316/316, DB-backed suites skipped without `DATABASE_URL`
  - portal: 94/94

## Next

- Screen verification by Fred.
- Continue final role replay, analytics hardening, and notifications V1.
