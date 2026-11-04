import { Request, Response } from 'express';
import { handlePhaseClosureError } from '../../shared/utils/error.js';
import { actorFromRequest, parseUploadAssetId, prepareUploadAttachment } from '../uploads/upload-attachment.js';
import * as phaseClosureService from './phase-closure.service.js';

/** A path id, or the not-found code of that resource (never a NaN query). */
function pathId(value: unknown, notFound: string): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(notFound);
  return id;
}

export async function getForPhase(req: Request, res: Response): Promise<void> {
  try {
    res.json(await phaseClosureService.getPhaseClosureState(pathId(req.params.phaseId, 'PHASE_NOT_FOUND')));
  } catch (error) {
    handlePhaseClosureError(res, error);
  }
}

export async function start(req: Request, res: Response): Promise<void> {
  try {
    const phaseId = pathId(req.params.phaseId, 'PHASE_NOT_FOUND');
    const attachment = await prepareUploadAttachment(parseUploadAssetId(req.body?.uploadAssetId), actorFromRequest(req));
    res.status(201).json(await phaseClosureService.startPhaseClosure(phaseId, req.user!.userId, attachment));
  } catch (error) {
    handlePhaseClosureError(res, error);
  }
}

export async function markInCircuit(req: Request, res: Response): Promise<void> {
  try {
    const closureId = pathId(req.params.id, 'PHASE_CLOSURE_NOT_FOUND');
    res.json(await phaseClosureService.markPhaseClosureInCircuit(closureId, req.user!.userId));
  } catch (error) {
    handlePhaseClosureError(res, error);
  }
}

export async function recordReturn(req: Request, res: Response): Promise<void> {
  try {
    const closureId = pathId(req.params.id, 'PHASE_CLOSURE_NOT_FOUND');
    const attachment = await prepareUploadAttachment(parseUploadAssetId(req.body?.uploadAssetId), actorFromRequest(req));
    res.json(await phaseClosureService.recordPhaseClosureReturn(closureId, req.user!.userId, attachment));
  } catch (error) {
    handlePhaseClosureError(res, error);
  }
}

/** WORKFLOW-FOUNDATION-1B - the retired direct close routes (M3
 *  /phases/:id/close, M4 and M5 /phases/:phaseId/close): a phase closes only
 *  through its closure courrier. Nothing is read or written. */
export function retiredDirectPhaseClose(_req: Request, res: Response): void {
  handlePhaseClosureError(res, new Error('PHASE_CLOSURE_WORKFLOW_REQUIRED'));
}
