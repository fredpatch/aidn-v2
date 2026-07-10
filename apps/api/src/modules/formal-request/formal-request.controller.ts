import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as formalService from './formal-request.service.js';
import { handleFormalRequestError } from '../../shared/utils/error.js';

async function checkApplicantOwnership(req: Request, requestId: number): Promise<boolean> {
  if (!req.applicant) return true; // staff — no ownership check needed
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
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const circuit = await formalService.submitFormalLetter(
      requestId,
      fileUrl,
      mimeType,
      req.applicant?.applicantId,
      parsedUploadAssetId
    );
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
    const { slot, fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!slot || !fileUrl || !mimeType) {
      res.status(400).json({ message: 'slot, fileUrl et mimeType sont requis.' });
      return;
    }
    const parsedUploadAssetId =
      uploadAssetId === undefined || uploadAssetId === null ? undefined : Number(uploadAssetId);
    if (parsedUploadAssetId !== undefined && !Number.isInteger(parsedUploadAssetId)) {
      res.status(400).json({ message: 'uploadAssetId invalide.' });
      return;
    }
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const doc = await formalService.submitDocument(
      requestId,
      slot,
      fileUrl,
      mimeType,
      req.user?.userId ?? req.applicant?.applicantId,
      !!req.applicant,
      parsedUploadAssetId
    );
    res.json(doc);
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}

export async function closePhase(req: Request, res: Response): Promise<void> {
  try {
    const {
      closureDocumentUrl,
      closureDocumentMimeType,
      closureNote,
      closureDocumentUploadAssetId,
    } = req.body ?? {};
    const parsedClosureUploadAssetId =
      closureDocumentUploadAssetId === undefined || closureDocumentUploadAssetId === null
        ? undefined
        : Number(closureDocumentUploadAssetId);
    if (parsedClosureUploadAssetId !== undefined && !Number.isInteger(parsedClosureUploadAssetId)) {
      res.status(400).json({ message: 'closureDocumentUploadAssetId invalide.' });
      return;
    }
    await formalService.closeFormalPhase(Number(req.params.phaseId), req.user!.userId, {
      closureDocumentUrl,
      closureDocumentMimeType,
      closureNote,
      closureDocumentUploadAssetId: parsedClosureUploadAssetId,
    });
    res.json({ message: 'Phase clôturée.' });
  } catch (error) {
    handleFormalRequestError(res, error);
  }
}
