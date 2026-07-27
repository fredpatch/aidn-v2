import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as inspectionService from './site-inspection.service.js';
import { handleSiteInspectionError } from '../../shared/utils/error.js';

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
    const result = await inspectionService.openSiteInspectionPhase(
      Number(req.params.requestId),
      req.user!.userId
    );
    res.status(201).json(result);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function getBundle(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const bundle = await inspectionService.getBundleForRequest(requestId);
    // "Avis R3" is DN-internal only (modules-feasibility.md, doc visibility
    // rules) — never returned to an applicant caller, not just hidden in UI.
    if (req.applicant) {
      res.json({ ...bundle, inspection: null });
      return;
    }
    res.json(bundle);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function uploadInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: 'fileUrl et mimeType sont requis.' });
      return;
    }
    const payment = await inspectionService.uploadInvoice(
      Number(req.params.phaseId),
      fileUrl,
      mimeType,
      req.user!.userId,
      parseUploadAssetId(uploadAssetId)
    );
    res.json(payment);
  } catch (error) {
    handleSiteInspectionError(res, error);
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
    const payment = await inspectionService.uploadPaymentProof(
      Number(req.params.phaseId),
      fileUrl,
      mimeType,
      req.user?.userId ?? req.applicant?.applicantId,
      parseUploadAssetId(uploadAssetId)
    );
    res.json(payment);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function validatePayment(req: Request, res: Response): Promise<void> {
  try {
    const payment = await inspectionService.validatePayment(
      Number(req.params.phaseId),
      req.user!.userId
    );
    res.json(payment);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function rejectPayment(req: Request, res: Response): Promise<void> {
  try {
    const { rejectionAction, rejectionReason } = req.body ?? {};
    if (!rejectionAction || !rejectionReason) {
      res.status(400).json({ message: 'rejectionAction et rejectionReason sont requis.' });
      return;
    }
    const payment = await inspectionService.rejectPayment(
      Number(req.params.phaseId),
      req.user!.userId,
      rejectionAction,
      rejectionReason
    );
    res.json(payment);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function scheduleSiteVisit(req: Request, res: Response): Promise<void> {
  try {
    const { r3AgentId, scheduledAt, location } = req.body ?? {};
    if (!r3AgentId || !scheduledAt) {
      res.status(400).json({ message: 'r3AgentId et scheduledAt sont requis.' });
      return;
    }
    const result = await inspectionService.scheduleSiteVisit({
      phaseId: Number(req.params.phaseId),
      r3AgentId: Number(r3AgentId),
      scheduledAt,
      location,
    });
    res.status(201).json(result);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function submitVerdict(req: Request, res: Response): Promise<void> {
  try {
    const { verdict, note } = req.body ?? {};
    if (!['compliant', 'non_compliant', 'compliant_with_reserves'].includes(verdict) || !note) {
      res.status(400).json({
        message: 'verdict (compliant, non_compliant ou compliant_with_reserves) et note sont requis.',
      });
      return;
    }
    const inspection = await inspectionService.submitInspectionVerdict(
      Number(req.params.phaseId),
      req.user!.userId,
      verdict,
      note
    );
    res.status(201).json(inspection);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function getMyQueue(req: Request, res: Response): Promise<void> {
  try {
    const queue = await inspectionService.getMyQueue(req.user!.userId);
    res.json(queue);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}
