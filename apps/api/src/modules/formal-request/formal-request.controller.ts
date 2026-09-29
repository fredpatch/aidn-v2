import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as formalService from './formal-request.service.js';
import { handleFormalRequestError } from '../../shared/utils/error.js';
import {
  actorFromRequest,
  parseOptionalUploadAssetId,
  parseUploadAssetId,
  prepareUploadAttachment,
} from '../uploads/upload-attachment.js';

async function checkApplicantOwnership(req: Request, requestId: number): Promise<boolean> {
  if (!req.applicant) return true; // staff - no ownership check needed
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  return !!request && request.applicantId === req.applicant.applicantId;
}

export async function openPhase(req: Request, res: Response): Promise<void> {
  try {
    const result = await formalService.openFormalPhase(
      Number(req.params.requestId),
      req.user!.userId
    );
    res.status(201).json(result);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function getBundle(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const bundle = await formalService.getBundleForRequest(requestId);
    res.json(bundle);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function submitLetter(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const circuit = await formalService.submitFormalLetter(requestId, attachment);
    res.status(201).json(circuit);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function markSigned(req: Request, res: Response): Promise<void> {
  try {
    const circuit = await formalService.markLetterSigned(
      Number(req.params.requestId),
      req.user!.userId
    );
    res.json(circuit);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function markPendingReview(req: Request, res: Response): Promise<void> {
  try {
    const circuit = await formalService.markLetterPendingReview(
      Number(req.params.requestId),
      req.user!.userId
    );
    res.json(circuit);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function submitDocument(req: Request, res: Response): Promise<void> {
  try {
    const { slot, uploadAssetId } = req.body ?? {};
    if (!slot) {
      res.status(400).json({ message: 'slot est requis.' });
      return;
    }
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const doc = await formalService.submitDocument(requestId, slot, attachment);
    res.json(doc);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function closePhase(req: Request, res: Response): Promise<void> {
  try {
    const { closureNote, closureDocumentUploadAssetId } = req.body ?? {};
    const closureAssetId = parseOptionalUploadAssetId(closureDocumentUploadAssetId);
    const attachment = closureAssetId
      ? await prepareUploadAttachment(closureAssetId, actorFromRequest(req))
      : undefined;
    await formalService.closeFormalPhase(Number(req.params.phaseId), req.user!.userId, {
      attachment,
      closureNote,
    });
    res.json({ message: 'Phase clôturée.' });
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}
