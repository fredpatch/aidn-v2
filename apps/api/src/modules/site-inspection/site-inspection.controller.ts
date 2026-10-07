import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as inspectionService from './site-inspection.service.js';
import { handleSiteInspectionError } from '../../shared/utils/error.js';
import {
  actorFromRequest,
  parseUploadAssetId,
  prepareUploadAttachment,
} from '../uploads/upload-attachment.js';
import { toApplicantSiteInspectionBundle } from './applicant-view.js';

async function checkApplicantOwnership(req: Request, requestId: number): Promise<boolean> {
  if (!req.applicant) return true;
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  return !!request && request.applicantId === req.applicant.applicantId;
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
    const roles = req.user?.roles ?? [];
    const isR3Only =
      roles.includes('r3_agent') &&
      !roles.some((role) => ['dn_agent', 'dn_supervisor', 's5_agent', 'SU'].includes(role));
    if (isR3Only) {
      await inspectionService.assertR3AssignedToRequest(requestId, req.user!.userId);
    }
    const bundle = await inspectionService.getBundleForRequest(requestId);
    // An applicant never receives the "avis R3" nor the assigned R3 agent id
    // (enforced server-side, not just hidden in the UI): see applicant-view.ts.
    res.json(req.applicant ? toApplicantSiteInspectionBundle(bundle) : bundle);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function getPaymentQueue(_req: Request, res: Response): Promise<void> {
  try {
    const queue = await inspectionService.getPaymentQueue();
    res.json(queue);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function uploadInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const payment = await inspectionService.uploadInvoice(Number(req.params.phaseId), attachment, req.user!.userId);
    res.json(payment);
  } catch (error) {
    handleSiteInspectionError(res, error);
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
    const payment = await inspectionService.uploadPaymentProof(
      Number(req.params.phaseId),
      requestId,
      req.applicant!.applicantId,
      attachment
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

export async function markAssignedSiteVisitHeld(req: Request, res: Response): Promise<void> {
  try {
    const siteVisit = await inspectionService.markAssignedSiteVisitHeld(
      Number(req.params.meetingId),
      req.user!.userId
    );
    res.json(siteVisit);
  } catch (error) {
    handleSiteInspectionError(res, error);
  }
}

export async function submitVerdict(req: Request, res: Response): Promise<void> {
  try {
    const { verdict, note } = req.body ?? {};
    if (!['compliant', 'non_compliant', 'compliant_with_reserves'].includes(verdict) || !note) {
      res.status(400).json({
        message:
          'verdict (compliant, non_compliant ou compliant_with_reserves) et note sont requis.',
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
