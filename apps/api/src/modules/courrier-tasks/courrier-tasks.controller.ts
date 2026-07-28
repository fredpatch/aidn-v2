import { Request, Response } from 'express';
import { handleFormalRequestError } from '../../shared/utils/error.js';
import * as courrierTasksService from './courrier-tasks.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const result = await courrierTasksService.listCourrierTasks({
      bucket: typeof req.query.bucket === 'string' ? req.query.bucket : undefined,
      source: typeof req.query.source === 'string' ? req.query.source : undefined,
    });
    res.json(result);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function confirmPrintedForSignature(req: Request, res: Response): Promise<void> {
  try {
    const task = await courrierTasksService.confirmPrintedForSignature(
      String(req.params.taskId),
      req.user!.userId
    );
    res.json(task);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function returnSigned(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: 'fileUrl et mimeType sont requis.' });
      return;
    }
    const parsedUploadAssetId =
      uploadAssetId === undefined || uploadAssetId === null ? undefined : Number(uploadAssetId);
    if (parsedUploadAssetId !== undefined && !Number.isInteger(parsedUploadAssetId)) {
      res.status(400).json({ message: 'uploadAssetId invalide.' });
      return;
    }

    const task = await courrierTasksService.returnSigned(
      String(req.params.taskId),
      fileUrl,
      mimeType,
      req.user!.userId,
      parsedUploadAssetId
    );
    res.json(task);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}
