import { Request, Response } from 'express';
import { db } from '../../shared/db/index.js';
import { insertAssetWithAddress } from './asset-registration.js';
import { acceptsUploadMime, registerReceivedFile, uploadRejection, UploadRejectedError } from './upload-intake.js';

type UploadRequest = Request & { uploadRelativeDir?: string };

function sourceAppFromOrigin(origin: string | undefined): 'admin' | 'portal' | 'api' | 'unknown' {
  if (!origin) return 'unknown';
  if (process.env.ADMIN_ORIGIN && origin === process.env.ADMIN_ORIGIN) return 'admin';
  if (process.env.PORTAL_ORIGIN && origin === process.env.PORTAL_ORIGIN) return 'portal';
  if (process.env.API_ORIGIN && origin === process.env.API_ORIGIN) return 'api';
  return 'unknown';
}

/** Generic upload endpoint, reused by every module that needs a file
 *  (M1 demande, M4 formal documents, M5 payment proof, etc.). Storage is
 *  local disk for now; files are read back only through /api/files
 *  (STORAGE-0A), so storage can change without changing this contract.
 *  STORAGE-0B - business endpoints then take only the returned
 *  uploadAssetId; name, type and size here are for display only. */
export async function upload(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: 'Aucun fichier recu.' });
    return;
  }

  try {
    const asset = await registerReceivedFile(file, async () => {
      // The Multer fileFilter already refused other types; kept as a guard.
      if (!acceptsUploadMime(file.mimetype)) throw new UploadRejectedError('UPLOAD_TYPE_NOT_ACCEPTED');
      const relativeDir = (req as UploadRequest).uploadRelativeDir;
      const storageKey = relativeDir ? `${relativeDir}/${file.filename}`.replace(/\\/g, '/') : file.filename;
      return db.transaction((tx) =>
        insertAssetWithAddress(tx, {
          storageKey,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedByUserId: req.user?.userId,
          uploadedByApplicantId: req.applicant?.applicantId,
          uploadedFromApp: sourceAppFromOrigin(req.get('origin')),
          uploadedFromOrigin: req.get('origin'),
          uploadedFromIp: req.ip,
          uploadedUserAgent: req.get('user-agent'),
          moduleHint: typeof req.body?.moduleHint === 'string' ? req.body.moduleHint : null,
        })
      );
    });

    res.status(201).json({
      uploadAssetId: asset.id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  } catch (error) {
    const rejection = uploadRejection(error);
    if (rejection) {
      res.status(rejection.status).json({ message: rejection.message, code: rejection.code });
      return;
    }
    console.error('[uploads]', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
}
