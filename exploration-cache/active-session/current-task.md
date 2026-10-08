# Current Task

**Session date**: 2026-10-08
**Status**: K4 atomic payment decisions implemented; preparing commit and push.

## Current Repo Truth

- Current branch: `main`, tracking `origin/main`.
- Latest committed work before this batch: `f49d1c0 feat(admin): k3 - confirmation step before definitive dossier rejection`.
- Current working tree contains K4 API/shared/admin changes plus docs/cache updates.
- Repo tree plus Git history remain the technical source of truth; Notion can lag and should be reconciled only after code/cache are updated.

## K4 Scope

K4 follows K3's definitive dossier-rejection confirmation. It keeps the same routes and admin flow, but hardens the server-side payment decision path.

- M5, M6, and M7 `rejectPayment` now share `modules/payments/payment-decisions.ts`.
- Rejections lock the payment row, verify that the phase belongs to the calling module, and write payment/request/audit changes inside one transaction.
- `validatePayment` now updates only if the payment is still `pending_validation`; losing races return `PAYMENT_NOT_PENDING`.
- M7 validation no longer creates a certificate after a competing rejection has already won.
- The dossier-cancellation reason prefix is shared through `@aidn/shared` via `dossierRejectionReason()`, used by API storage and the admin K3 preview.
- PostgreSQL-backed tests cover rejection, rollback, module isolation, non-pending payments, deterministic validate/reject races, and simultaneous decisions.

## Validation To Run Before Push

- `npm run typecheck --workspaces --if-present`
- `npm run test --workspace=apps/api`
- `npm run test --workspace=apps/admin`
- `npm run build`

If `DATABASE_URL` is not set, the K4 PostgreSQL race tests skip themselves by design.

## Known Follow-Up

- K5: add the same module check to `validatePayment` that K4 added to rejection.
- K5: make M7 validation and certificate creation fully atomic.
- Payment API hardening: reject blank rejection reasons and unknown `rejectionAction` values before they reach PostgreSQL enum errors.
