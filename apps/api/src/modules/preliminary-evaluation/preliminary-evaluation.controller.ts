import { Request, Response } from 'express';
import * as evalService from './preliminary-evaluation.service.js';
import { handlePreliminaryEvaluationError } from '../../shared/utils/error.js';
import { actorFromRequest, parseUploadAssetId, prepareUploadAttachment } from '../uploads/upload-attachment.js';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import { eq } from 'drizzle-orm';

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const view = await evalService.getForPhase(Number(req.params.phaseId));
    if (!view) {
      res.status(404).json({ message: 'Aucune déclaration de pré-évaluation pour cette phase.' });
      return;
    }
    res.json(view);
  } catch (error) {
    handlePreliminaryEvaluationError(res, error);
  }
}

/** Bundle endpoint for the portal - phase + meeting + declaration in one
 *  call, ownership-checked for applicants. */
export async function getBundle(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params.requestId);

    if (req.applicant) {
      const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
      if (!request || request.applicantId !== req.applicant.applicantId) {
        res.status(404).json({ message: 'Demande introuvable.' });
        return;
      }
    }

    const bundle = await evalService.getBundleForRequest(requestId);
    res.json(bundle);
  } catch (error) {
    handlePreliminaryEvaluationError(res, error);
  }
}

export async function makeAvailable(req: Request, res: Response): Promise<void> {
  try {
    const { returnDays } = req.body ?? {};
    const view = await evalService.makeAvailable(
      Number(req.params.phaseId),
      req.user!.userId,
      returnDays ? Number(returnDays) : undefined
    );
    res.status(201).json(view);
  } catch (error) {
    handlePreliminaryEvaluationError(res, error);
  }
}

export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const phaseId = Number(req.params.phaseId);

    // Ownership check: an applicant can only submit for their own dossier.
    const context = await evalService.getRequestIdForPhase(phaseId);
    if (!context || context.applicantId !== req.applicant!.applicantId) {
      res.status(404).json({ message: 'Phase introuvable.' });
      return;
    }

    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const view = await evalService.submit(phaseId, attachment);
    res.json(view);
  } catch (error) {
    handlePreliminaryEvaluationError(res, error);
  }
}
