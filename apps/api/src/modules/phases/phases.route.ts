import { Router } from "express";
import { authenticate, requireRole } from "../../shared/guards/auth.middleware.js";
import * as phasesController from "./phases.controller.js";

const router = Router();

router.use(authenticate, requireRole("dn_agent", "dn_supervisor", "SU"));

router.post("/requests/:requestId/start-preliminary-phase", phasesController.startPreliminaryPhase);
router.get("/requests/:requestId/phase", phasesController.getForRequest);
router.get("/:id", phasesController.get);
router.post("/:id/close", phasesController.close);

export default router;
