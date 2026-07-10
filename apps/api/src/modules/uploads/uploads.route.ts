import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  authenticate,
  authenticateEither,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as uploadsController from './uploads.controller.js';
import * as uploadsAdminController from './uploads.admin.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRootDir = path.resolve(__dirname, '../../../uploads');

function sourceAppFromOrigin(origin: string | undefined): 'admin' | 'portal' | 'api' | 'unknown' {
  if (!origin) return 'unknown';
  if (process.env.ADMIN_ORIGIN && origin === process.env.ADMIN_ORIGIN) return 'admin';
  if (process.env.PORTAL_ORIGIN && origin === process.env.PORTAL_ORIGIN) return 'portal';
  if (process.env.API_ORIGIN && origin === process.env.API_ORIGIN) return 'api';
  return 'unknown';
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

type UploadRequest = Express.Request & { uploadRelativeDir?: string };

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const sourceApp = sourceAppFromOrigin(req.get('origin'));
    const moduleHintRaw = typeof req.body?.moduleHint === 'string' ? req.body.moduleHint : 'misc';
    const moduleHint = sanitizeSegment(moduleHintRaw) || 'misc';

    const relativeDir = path.posix.join(year, month, day, sourceApp, moduleHint);
    const absoluteDir = path.join(uploadRootDir, relativeDir);
    fs.mkdirSync(absoluteDir, { recursive: true });
    (req as UploadRequest).uploadRelativeDir = relativeDir;
    cb(null, absoluteDir);
  },
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
router.post('/', authenticateEither, upload.single('file'), uploadsController.upload);

// SU-only explicit upload-management APIs (linking discipline, diagnostics,
// and stale orphan cleanup).
router.get('/diagnostics', authenticate, requireRole('SU'), uploadsAdminController.diagnostics);
router.post('/link', authenticate, requireRole('SU'), uploadsAdminController.link);
router.post('/cleanup-orphans', authenticate, requireRole('SU'), uploadsAdminController.cleanup);

export default router;
