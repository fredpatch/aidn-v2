import { Request, Response } from 'express';
import { ACCEPTED_DOCUMENT_MIME_TYPES } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { insertAssetWithAddress } from './asset-registration.js';

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
 *  (STORAGE-0A), so storage can change without changing this contract. */
export async function upload(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ message: 'Aucun fichier recu.' });
    return;
  }

  if (
    !ACCEPTED_DOCUMENT_MIME_TYPES.includes(
      req.file.mimetype as (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number]
    )
  ) {
    res.status(400).json({
      message: 'Type de fichier non accepte. Formats acceptes : PDF, Word, PNG, JPG.',
    });
    return;
  }

  const relativeDir = (req as UploadRequest).uploadRelativeDir;
  const storageKey = relativeDir
    ? `${relativeDir}/${req.file.filename}`.replace(/\\/g, '/')
    : req.file.filename;
  // The response carries the asset's stable address, never the physical path.
  const asset = await db.transaction((tx) =>
    insertAssetWithAddress(tx, {
      storageKey,
      originalName: req.file!.originalname,
      mimeType: req.file!.mimetype,
      sizeBytes: req.file!.size,
      uploadedByUserId: req.user?.userId,
      uploadedByApplicantId: req.applicant?.applicantId,
      uploadedFromApp: sourceAppFromOrigin(req.get('origin')),
      uploadedFromOrigin: req.get('origin'),
      uploadedFromIp: req.ip,
      uploadedUserAgent: req.get('user-agent'),
      moduleHint: typeof req.body?.moduleHint === 'string' ? req.body.moduleHint : null,
    })
  );
  const fileUrl = asset.address;

  res.status(201).json({
    uploadAssetId: asset.id,
    fileUrl,
    mimeType: req.file.mimetype,
    originalName: req.file.originalname,
  });
}
