import { Router } from "express";
import { authenticate, requireRole } from "../../shared/guards/auth.middleware.js";
import * as usersController from "./users.controller.js";

const router = Router();

// Narrow, least-privilege lookup for agent pickers (e.g. M6 site visit
// scheduling needs to list r3_agent users) — not gated SU-only like the rest
// of this module, but still staff-only and returns minimal fields only.
router.get(
  "/by-role/:role",
  authenticate,
  requireRole("dn_agent", "dn_supervisor", "s5_agent", "SU"),
  usersController.listByRole
);

// User management is SU-only for now - see project/modules-feasibility.md M13.
router.use(authenticate, requireRole("SU"));

router.get("/", usersController.list);
router.get("/:id", usersController.get);
router.post("/", usersController.create);
router.patch("/:id", usersController.update);
router.patch("/:id/activation", usersController.toggleActivation);
router.post("/:id/reset-otp", usersController.resetOTP);

export default router;
