import { Router } from "express";
import { authenticateApplicantSession } from "../../shared/guards/auth.middleware.js";
import * as applicantAuthController from "./applicant-auth.controller.js";

const router = Router();

router.post("/login", applicantAuthController.login);
router.post("/refresh", applicantAuthController.refresh);
// ACCOUNT-V2 - open with a temporary password: the portal needs who is
// signed in, a way out, and the change itself.
router.post("/logout", authenticateApplicantSession, applicantAuthController.logout);
router.get("/me", authenticateApplicantSession, applicantAuthController.me);
router.post("/change-password", authenticateApplicantSession, applicantAuthController.changePassword);

export default router;
