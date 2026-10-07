import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import {
  authenticate,
  authenticateEither,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as uploadsController from './uploads.controller.js';
import * as uploadsAdminController from './uploads.admin.controller.js';
import { UPLOADS_ROOT } from '../../shared/uploads-root.js';
import { MAX_UPLOAD_BYTES } from '@aidn/shared';
import { acceptsUploadMime, uploadRejection, UploadRejectedError } from './upload-intake.js';

type UploadRequest = Express.Request & { uploadRelativeDir?: string };

/** STORAGE-1A - every browser upload lands in a dated staging area under a
 *  server-generated UUID filename. `moduleHint` and the source app no longer
 *  influence the physical path (they remain DB metadata only, see
 *  uploads.controller.ts) - the path is entirely server-controlled, and
 *  eligibility for relocation is later inferred purely from the `staging/`
 *  prefix (STORAGE-2A). The extension is the only thing kept from the
 *  original filename. */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const relativeDir = path.posix.join('staging', year, month, day);
    const absoluteDir = path.join(UPLOADS_ROOT, relativeDir);
    fs.mkdirSync(absoluteDir, { recursive: true });
    (_req as UploadRequest).uploadRelativeDir = relativeDir;
    cb(null, absoluteDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES }, // shared with the portal pre-check
  // STORAGE-0B - a refused type is never written to disk.
  fileFilter: (_req, file, cb) => {
    if (acceptsUploadMime(file.mimetype)) cb(null, true);
    else cb(new UploadRejectedError('UPLOAD_TYPE_NOT_ACCEPTED'));
  },
});

/** Multer errors (refused type, too large) as clean 4xx responses. Multer
 *  removes the partial file itself when it aborts. */
function receiveSingleFile(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    const rejection = uploadRejection(error);
    if (rejection) {
      res.status(rejection.status).json({ message: rejection.message, code: rejection.code });
      return;
    }
    next(error);
  });
}

const router = Router();

// Reachable by either an applicant (portal) or staff (admin manual entry) -
// same dual-auth pattern as the requests submit endpoint, since uploads
// happen from both sides of the same M1 flow.
router.post('/', authenticateEither, receiveSingleFile, uploadsController.upload);

// SU-only explicit upload-management APIs (linking discipline, diagnostics,
// and stale orphan cleanup).
router.get('/diagnostics', authenticate, requireRole('SU'), uploadsAdminController.diagnostics);
router.post('/link', authenticate, requireRole('SU'), uploadsAdminController.link);
router.post('/cleanup-orphans', authenticate, requireRole('SU'), uploadsAdminController.cleanup);

export default router;
