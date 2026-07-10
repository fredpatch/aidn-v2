import { Request, Response } from 'express';
import * as uploadsService from './uploads.service.js';
import { UPLOAD_OWNER_TYPES } from './uploads.types.js';

function isValidOwnerType(value: string): value is (typeof UPLOAD_OWNER_TYPES)[number] {
  return (UPLOAD_OWNER_TYPES as readonly string[]).includes(value);
}

export async function diagnostics(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await uploadsService.getUploadDiagnostics();
    res.json(stats);
  } catch (error) {
    console.error('[uploads/diagnostics]', error);
    res.status(500).json({ message: 'Erreur interne.' });
  }
}

export async function link(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId, ownerType, ownerId, expectedFileUrl, allowRelink } = req.body ?? {};

    const parsedUploadAssetId = Number(uploadAssetId);
    const parsedOwnerId = Number(ownerId);
    if (!Number.isInteger(parsedUploadAssetId) || !Number.isInteger(parsedOwnerId)) {
      res.status(400).json({ message: 'uploadAssetId et ownerId sont requis.' });
      return;
    }

    if (!ownerType || !isValidOwnerType(ownerType)) {
      res.status(400).json({ message: 'ownerType invalide.' });
      return;
    }

    await uploadsService.linkOrRelinkUploadAsset({
      uploadAssetId: parsedUploadAssetId,
      ownerType,
      ownerId: parsedOwnerId,
      expectedFileUrl: typeof expectedFileUrl === 'string' ? expectedFileUrl : undefined,
      allowRelink: !!allowRelink,
      actorUserId: req.user!.userId,
    });

    res.status(204).send();
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    if (code === 'UPLOAD_ASSET_NOT_FOUND' || code === 'UPLOAD_ASSET_FILE_MISMATCH') {
      res.status(400).json({ message: 'Fichier upload invalide.', code });
      return;
    }
    if (code === 'UPLOAD_ASSET_ALREADY_LINKED') {
      res.status(409).json({ message: 'Ce fichier upload est déjà lié.', code });
      return;
    }

    console.error('[uploads/link]', error);
    res.status(500).json({ message: 'Erreur interne.' });
  }
}

export async function cleanup(req: Request, res: Response): Promise<void> {
  try {
    const { retentionDays } = req.body ?? {};
    const parsedRetentionDays =
      retentionDays === undefined || retentionDays === null ? undefined : Number(retentionDays);

    if (parsedRetentionDays !== undefined && !Number.isInteger(parsedRetentionDays)) {
      res.status(400).json({ message: 'retentionDays invalide.' });
      return;
    }

    const result = await uploadsService.cleanupStaleOrphanUploads({
      actorUserId: req.user!.userId,
      retentionDays: parsedRetentionDays,
    });

    res.json(result);
  } catch (error) {
    console.error('[uploads/cleanup]', error);
    res.status(500).json({ message: 'Erreur interne.' });
  }
}
