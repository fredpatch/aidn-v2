import { Router } from "express";
import { authenticate, authenticateEither, authenticateApplicant, requireRole } from "../../shared/guards/auth.middleware.js";
import * as requestsController from "./requests.controller.js";

const router = Router();

// Submission itself is reachable from the portal (applicant, no internal
// role needed) and from reception/assistant_dg for a manual physical
// drop-off - both hit the same endpoint, per the M1 decision to keep one
// entry point regardless of channel.
router.post("/", authenticateEither, requestsController.submit);

// Applicant-only: "my current demande" - the portal doesn't know an ID
// upfront, and per the "one active request" rule there's at most one
// non-terminal request to show at a time.
router.get("/mine", authenticateApplicant, requestsController.mine);

router.get("/", authenticate, requestsController.list);
router.get("/:id", authenticate, requestsController.get);

// Physical signature circuit transitions are internal-staff actions only.
router.post(
  "/:id/send-to-signature",
  authenticate,
  requireRole("assistant_dg", "reception", "SU"),
  requestsController.sendToSignature
);
router.post(
  "/:id/confirm-printed-for-signature",
  authenticate,
  requireRole("assistant_dg", "reception", "SU"),
  requestsController.confirmPrintedForSignature
);
router.post(
  "/:id/mark-signed",
  authenticate,
  requireRole("assistant_dg", "reception", "SU"),
  requestsController.markSigned
);
router.post(
  "/:id/mark-pending-review",
  authenticate,
  requireRole("assistant_dg", "reception", "SU"),
  requestsController.markPendingReview
);
router.post(
  "/:id/return-signed-from-dg",
  authenticate,
  requireRole("assistant_dg", "reception", "SU"),
  requestsController.returnSignedFromDg
);

// Cancellation: the applicant can cancel their own demande while still
// Depose, and staff can do it on their behalf too (e.g. postulant calls in).
router.post("/:id/cancel", authenticateEither, requestsController.cancel);

router.post(
  "/:id/replace-document",
  authenticate,
  requireRole("reception", "assistant_dg", "dn_agent", "dn_supervisor", "SU"),
  requestsController.replaceDocument
);

export default router;
