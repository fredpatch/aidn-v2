import { Request, Response } from 'express';
import { handleFormalRequestError } from '../../shared/utils/error.js';
import * as courrierTasksService from './courrier-tasks.service.js';
import { actorFromRequest, parseUploadAssetId, prepareUploadAttachment } from '../uploads/upload-attachment.js';

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
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const task = await courrierTasksService.returnSigned(String(req.params.taskId), attachment, req.user!.userId);
    res.json(task);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}
