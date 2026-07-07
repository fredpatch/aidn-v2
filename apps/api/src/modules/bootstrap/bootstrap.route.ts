import { Router } from "express";
import * as bootstrapController from "./bootstrap.controller.js";

const router = Router();

// Public - no auth possible yet, nobody exists until this runs.
router.get("/status", bootstrapController.status);
router.post("/init", bootstrapController.init);

export default router;
