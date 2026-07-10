import { Request, Response } from 'express';
import { ACCEPTED_DOCUMENT_MIME_TYPES } from '@aidn/shared';
import { db } from '../../shared/db/index.js';
import { uploadAssets } from '../../shared/db/schema.js';

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
 *  local disk for now (see server.ts static serving) - swappable for
 *  object storage later without changing this contract. */
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
  const fileUrl = `/uploads/${storageKey}`;
  const [asset] = await db
    .insert(uploadAssets)
    .values({
      fileUrl,
      storageKey,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedByUserId: req.user?.userId,
      uploadedByApplicantId: req.applicant?.applicantId,
      uploadedFromApp: sourceAppFromOrigin(req.get('origin')),
      uploadedFromOrigin: req.get('origin'),
      uploadedFromIp: req.ip,
      uploadedUserAgent: req.get('user-agent'),
      moduleHint: typeof req.body?.moduleHint === 'string' ? req.body.moduleHint : null,
    })
    .returning({ id: uploadAssets.id });

  res.status(201).json({
    uploadAssetId: asset.id,
    fileUrl,
    mimeType: req.file.mimetype,
    originalName: req.file.originalname,
  });
}
