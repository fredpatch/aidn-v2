# 2026-10-08 - K4 atomic payment decisions

Continuation of K3's definitive dossier-rejection confirmation. No route or UI contract change.

## What changed

- Added `modules/payments/payment-decisions.ts` with shared M5/M6/M7 payment rejection logic.
- Rejection now runs in one transaction: lock the payment row, verify the phase module, update the payment, optionally reject the dossier, and write the audit entry together.
- Validation now uses a conditional `pending_validation` update, so a competing validation/rejection cannot both succeed.
- M7 validation refuses the lost race before certificate creation.
- Moved the dossier rejection wording into `@aidn/shared` as `dossierRejectionReason()` and reused it from the admin confirmation preview.

## Tests and evidence

- `payment-decisions.db.test.ts` covers PostgreSQL-backed rejection, rollback, module isolation, non-pending status, deterministic races, and simultaneous decisions.
- The DB-backed test is intentionally skipped without `DATABASE_URL`; use a migrated disposable database for the full K4 proof.

## Follow-up

- K5: add phase-module validation to `validatePayment`.
- K5: make M7 validation and certificate creation a single atomic operation.
- Harden request payload validation for blank reasons and unknown rejection actions.
