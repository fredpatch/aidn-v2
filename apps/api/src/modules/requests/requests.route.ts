import { Router } from "express";
import { authenticate, requireRole } from "../../shared/guards/auth.middleware.js";
import * as requestsController from "./requests.controller.js";

const router = Router();

// Submission itself is reachable from the portal (applicant, no internal
// role needed) and from reception/assistant_dg for a manual physical
// drop-off - both hit the same endpoint, per the M1 decision to keep one
// entry point regardless of channel. Authentication still applies (either
// an applicant session or an internal one), but no specific internal role
// is required here.
router.post("/", authenticate, requestsController.submit);

router.get("/", authenticate, requestsController.list);
router.get("/:id", authenticate, requestsController.get);

// Circuit DG transitions and cancellation are internal-staff actions only.
router.post(
  "/:id/mark-signed",
  authenticate,
  requireRole("assistant_dg", "reception", "dn_agent", "dn_supervisor", "SU"),
  requestsController.markSigned
);
router.post(
  "/:id/mark-pending-review",
  authenticate,
  requireRole("assistant_dg", "reception", "dn_agent", "dn_supervisor", "SU"),
  requestsController.markPendingReview
);
router.post("/:id/cancel", authenticate, requestsController.cancel);
router.post(
  "/:id/replace-document",
  authenticate,
  requireRole("reception", "assistant_dg", "dn_agent", "dn_supervisor", "SU"),
  requestsController.replaceDocument
);

export default router;
