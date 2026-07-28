import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as evalService from './deep-evaluation.service.js';
import { handleDeepEvaluationError } from '../../shared/utils/error.js';

async function checkApplicantOwnership(req: Request, requestId: number): Promise<boolean> {
  if (!req.applicant) return true;
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  return !!request && request.applicantId === req.applicant.applicantId;
}

function parseUploadAssetId(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return isNaN(parsed) ? undefined : parsed;
}

export async function openPhase(req: Request, res: Response): Promise<void> {
  try {
    const result = await evalService.openDeepEvaluationPhase(
      Number(req.params.requestId),
      req.user!.userId
    );
    res.status(201).json(result);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function getBundle(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const bundle = await evalService.getBundleForRequest(requestId);
    res.json(bundle);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function getPaymentQueue(_req: Request, res: Response): Promise<void> {
  try {
    const queue = await evalService.getPaymentQueue();
    res.json(queue);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function uploadInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: 'fileUrl et mimeType sont requis.' });
      return;
    }
    const payment = await evalService.uploadInvoice(
      Number(req.params.phaseId),
      fileUrl,
      mimeType,
      req.user!.userId,
      parseUploadAssetId(uploadAssetId)
    );
    res.json(payment);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function uploadProof(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: 'fileUrl et mimeType sont requis.' });
      return;
    }
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const payment = await evalService.uploadPaymentProof(
      Number(req.params.phaseId),
      fileUrl,
      mimeType,
      req.user?.userId ?? req.applicant?.applicantId,
      parseUploadAssetId(uploadAssetId)
    );
    res.json(payment);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function validatePayment(req: Request, res: Response): Promise<void> {
  try {
    const payment = await evalService.validatePayment(Number(req.params.phaseId), req.user!.userId);
    res.json(payment);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function rejectPayment(req: Request, res: Response): Promise<void> {
  try {
    const { rejectionAction, rejectionReason } = req.body ?? {};
    if (!rejectionAction || !rejectionReason) {
      res.status(400).json({ message: 'rejectionAction et rejectionReason sont requis.' });
      return;
    }
    const payment = await evalService.rejectPayment(
      Number(req.params.phaseId),
      req.user!.userId,
      rejectionAction,
      rejectionReason
    );
    res.json(payment);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function setVerdict(req: Request, res: Response): Promise<void> {
  try {
    const { verdict, correctionDays } = req.body ?? {};
    if (!['validated', 'rejected', 'needs_correction'].includes(verdict)) {
      res.status(400).json({
        message: 'verdict invalide (validated, rejected ou needs_correction).',
      });
      return;
    }
    const evaluation = await evalService.setVerdict(
      Number(req.params.evaluationId),
      verdict,
      req.user!.userId,
      correctionDays ? Number(correctionDays) : undefined
    );
    res.json(evaluation);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function resubmitDocument(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: 'fileUrl et mimeType sont requis.' });
      return;
    }
    const evaluation = await evalService.resubmitDocument(
      Number(req.params.evaluationId),
      fileUrl,
      mimeType,
      req.user?.userId ?? req.applicant?.applicantId,
      parseUploadAssetId(uploadAssetId)
    );
    res.json(evaluation);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function closePhase(req: Request, res: Response): Promise<void> {
  try {
    const {
      closureDocumentUrl,
      closureDocumentMimeType,
      closureDocumentUploadAssetId,
      closureNote,
    } = req.body ?? {};

    const parsedClosureUploadAssetId =
      closureDocumentUploadAssetId === undefined || closureDocumentUploadAssetId === null
        ? undefined
        : Number(closureDocumentUploadAssetId);

    await evalService.closeDeepEvaluationPhase(Number(req.params.phaseId), req.user!.userId, {
      closureDocumentUrl,
      closureDocumentMimeType,
      closureDocumentUploadAssetId: parsedClosureUploadAssetId,
      closureNote,
    });
    res.json({ message: 'Phase clôturée.' });
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}
