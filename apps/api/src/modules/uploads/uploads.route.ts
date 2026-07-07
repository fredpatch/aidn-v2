import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { authenticateEither } from "../../shared/guards/auth.middleware.js";
import * as uploadsController from "./uploads.controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, "../../../uploads");

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

const router = Router();

// Reachable by either an applicant (portal) or staff (admin manual entry) -
// same dual-auth pattern as the requests submit endpoint, since uploads
// happen from both sides of the same M1 flow.
router.post("/", authenticateEither, upload.single("file"), uploadsController.upload);

export default router;
