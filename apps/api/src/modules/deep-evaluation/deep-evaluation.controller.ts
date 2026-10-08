import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as evalService from './deep-evaluation.service.js';
import { handleDeepEvaluationError } from '../../shared/utils/error.js';
import {
  actorFromRequest,
  parseOptionalUploadAssetId,
  parseUploadAssetId,
  prepareUploadAttachment,
} from '../uploads/upload-attachment.js';
import { parsePaymentRejection } from '../payments/payment-rejection-input.js';

async function checkApplicantOwnership(req: Request, requestId: number): Promise<boolean> {
  if (!req.applicant) return true;
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  return !!request && request.applicantId === req.applicant.applicantId;
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
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const payment = await evalService.uploadInvoice(Number(req.params.phaseId), attachment, req.user!.userId);
    res.json(payment);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function uploadProof(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const payment = await evalService.uploadPaymentProof(
      Number(req.params.phaseId),
      requestId,
      req.applicant!.applicantId,
      attachment
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
    // K8 - action and trimmed reason checked before any lookup (400).
    const { rejectionAction, rejectionReason } = parsePaymentRejection(req.body);
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
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const evaluation = await evalService.resubmitDocument(
      Number(req.params.evaluationId),
      req.applicant!.applicantId,
      attachment
    );
    res.json(evaluation);
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}

export async function closePhase(req: Request, res: Response): Promise<void> {
  try {
    const { closureDocumentUploadAssetId, closureNote } = req.body ?? {};
    const closureAssetId = parseOptionalUploadAssetId(closureDocumentUploadAssetId);
    const attachment = closureAssetId
      ? await prepareUploadAttachment(closureAssetId, actorFromRequest(req))
      : undefined;
    await evalService.closeDeepEvaluationPhase(Number(req.params.phaseId), req.user!.userId, {
      attachment,
      closureNote,
    });
    res.json({ message: 'Phase clôturée.' });
  } catch (error) {
    handleDeepEvaluationError(res, error);
  }
}
