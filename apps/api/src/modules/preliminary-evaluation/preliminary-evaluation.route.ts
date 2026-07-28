import { Router } from "express";
import {
  authenticate,
  authenticateEither,
  requireApplicantOrRole,
  requireRole,
} from "../../shared/guards/auth.middleware.js";
import * as evalController from "./preliminary-evaluation.controller.js";

const router = Router();

// Mounted at /api/preliminary-evaluation - deliberately NOT under /api/phases,
// since phases.route.ts applies a router-wide staff-only `authenticate` gate
// to everything under that prefix (router.use with no path restriction).
// Nesting these routes there would silently block applicant access before
// authenticateEither ever got a chance to run.
router.get(
  "/by-request/:requestId",
  authenticateEither,
  requireApplicantOrRole("dn_agent", "dn_supervisor", "SU"),
  evalController.getBundle
);
router.get(
  "/:phaseId",
  authenticateEither,
  requireApplicantOrRole("dn_agent", "dn_supervisor", "SU"),
  evalController.get
);
router.post(
  "/:phaseId/make-available",
  authenticate,
  requireRole("dn_agent", "dn_supervisor", "SU"),
  evalController.makeAvailable
);
router.post("/:phaseId/submit", authenticateEither, evalController.submit);

export default router;
