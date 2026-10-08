import { Router } from "express";
import { authenticate, requireRole } from "../../shared/guards/auth.middleware.js";
import * as phasesController from "./phases.controller.js";

const router = Router();

// Read-only, low-sensitivity, needed by any staff role that can land on a
// phase detail page (not just DN) - see phases.service.ts getPhasesSummary
// for why this isn't behind the module-wide DN-only gate below.
router.get(
  "/requests/:requestId/phases-summary",
  authenticate,
  phasesController.getPhasesSummary
);

// K7b - same audience as phases-summary: tells a phase page whether the
// dossier is closed, so it can render read-only.
router.get(
  "/requests/:requestId/dossier-state",
  authenticate,
  phasesController.getDossierState
);

router.use(authenticate, requireRole("dn_agent", "dn_supervisor", "SU"));

router.post("/requests/:requestId/start-preliminary-phase", phasesController.startPreliminaryPhase);
router.get("/requests/:requestId/phase", phasesController.getForRequest);
router.get("/:id", phasesController.get);
router.post("/:id/close", phasesController.close);

export default router;
