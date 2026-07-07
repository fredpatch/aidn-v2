import { Router } from "express";
import { authenticate } from "../../shared/guards/auth.middleware.js";
import * as authController from "./auth.controller.js";

const router = Router();

// Public - no auth required
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);

// Protected - requires a valid token
router.post("/set-password", authenticate, authController.setPassword);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);

export default router;
