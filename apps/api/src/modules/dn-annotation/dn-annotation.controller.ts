import { Request, Response } from 'express';
import { handleDnAnnotationError } from '../../shared/utils/error.js';
import * as service from './dn-annotation.service.js';
import { actorFromRequest, parseUploadAssetId, prepareUploadAttachment } from '../uploads/upload-attachment.js';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    res.json(await service.listDnAnnotationTasks({ bucket: typeof req.query.bucket === 'string' ? req.query.bucket : undefined }));
  } catch (error) {
    handleDnAnnotationError(res, error);
  }
}

export async function sendToDirector(req: Request, res: Response): Promise<void> {
  try {
    res.json(await service.sendToDirector(String(req.params.taskId), req.user!.userId));
  } catch (error) {
    handleDnAnnotationError(res, error);
  }
}

export async function returnAnnotated(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    res.json(await service.returnAnnotated(String(req.params.taskId), attachment, req.user!.userId));
  } catch (error) {
    handleDnAnnotationError(res, error);
  }
}
