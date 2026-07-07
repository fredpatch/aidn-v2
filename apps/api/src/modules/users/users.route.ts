import { Router } from "express";
import { authenticate, requireRole } from "../../shared/guards/auth.middleware.js";
import * as usersController from "./users.controller.js";

const router = Router();

// User management is SU-only for now - see project/modules-feasibility.md M13.
router.use(authenticate, requireRole("SU"));

router.get("/", usersController.list);
router.get("/:id", usersController.get);
router.post("/", usersController.create);
router.patch("/:id", usersController.update);
router.patch("/:id/activation", usersController.toggleActivation);
router.post("/:id/reset-otp", usersController.resetOTP);

export default router;
