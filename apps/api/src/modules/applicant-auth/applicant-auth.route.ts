import { Router } from "express";
import { authenticateApplicant } from "../../shared/guards/auth.middleware.js";
import * as applicantAuthController from "./applicant-auth.controller.js";

const router = Router();

router.post("/login", applicantAuthController.login);
router.post("/refresh", applicantAuthController.refresh);
router.post("/logout", authenticateApplicant, applicantAuthController.logout);
router.get("/me", authenticateApplicant, applicantAuthController.me);

export default router;
