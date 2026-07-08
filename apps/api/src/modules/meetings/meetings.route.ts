import { Router } from "express";
import { authenticate, authenticateEither, requireRole } from "../../shared/guards/auth.middleware.js";
import * as meetingsController from "./meetings.controller.js";

const router = Router();

// Scheduling and status changes: dn_agent/dn_supervisor only (per Sprint 2
// decision - reception/assistant_dg's role stays scoped to the M1 parapheur).
router.post("/", authenticate, requireRole("dn_agent", "dn_supervisor", "SU"), meetingsController.schedule);
router.patch("/:id/status", authenticate, requireRole("dn_agent", "dn_supervisor", "SU"), meetingsController.markStatus);
router.post("/:id/reschedule", authenticate, requireRole("dn_agent", "dn_supervisor", "SU"), meetingsController.reschedule);

// Read access: either side needs to see the meeting/ticket.
router.get("/:id", authenticateEither, meetingsController.get);
router.get("/:id/ticket", authenticateEither, meetingsController.ticket);

export default router;
