# 2026-10-09 - D3b Request Views

## Shipped

- Added `request_views` through migration `0006_d3b_request_views`.
  The table records each internal user's `last_viewed_at` per dossier.
- Added `POST /requests/:id/view` for DN, DN supervisor, and SU users. It
  verifies the dossier exists, upserts the row, and returns 204.
- Updated the Demandes cockpit to compute `unread` for the requesting agent:
  open dossiers are unread until opened, become unread again after another
  actor's activity, ignore the viewer's own activity, and are never unread once
  closed.
- Added admin API/types for `markRequestViewed` and `unread`; D3c will wire
  the visible unread markers and sort controls.
- Fixed D3a raw SQL timestamp decoding so activity timestamps are UTC even when
  the Node process runs in a non-UTC time zone.

## Verification

- `git diff --check`
- `npm run typecheck`
- `npx eslint "apps/*/src/**/*.{ts,tsx}" "packages/*/src/**/*.{ts,tsx}"`
  (0 errors, 4 existing hook warnings)
- `npm run test --workspaces --if-present`
  - admin: 171/171
  - API: DB-backed suites skip without `DATABASE_URL` in this local run
  - portal: 94/94
- `npm run build`

## Next

- D3c: call `markRequestViewed` when the reading pane opens, add unread visual
  treatment, and add "Derniere activite" sorting.
