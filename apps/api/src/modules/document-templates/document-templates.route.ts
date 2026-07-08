import { Router } from "express";
import { authenticate, authenticateEither, requireRole } from "../../shared/guards/auth.middleware.js";
import * as templatesController from "./document-templates.controller.js";

const router = Router();

// Management view - staff only.
router.get("/", authenticate, requireRole("dn_agent", "dn_supervisor", "SU"), templatesController.list);
router.post("/", authenticate, requireRole("dn_agent", "dn_supervisor", "SU"), templatesController.upsert);

// Download by key - both staff and applicants need this (applicant to fill
// out a blank form, staff to double-check what's currently published).
router.get("/:key", authenticateEither, templatesController.getByKey);

export default router;
