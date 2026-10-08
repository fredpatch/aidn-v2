import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as certificatesService from './certificates.service.js';
import { handleCertificatesError } from '../../shared/utils/error.js';
import {
  actorFromRequest,
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
    const result = await certificatesService.openDeliveryPhase(
      Number(req.params.requestId),
      req.user!.userId
    );
    res.status(201).json(result);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function getBundle(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params.requestId);
    if (!(await checkApplicantOwnership(req, requestId))) {
      res.status(404).json({ message: 'Demande introuvable.' });
      return;
    }
    const bundle = await certificatesService.getBundleForRequest(requestId);
    // "Avis R3" precedent: apply the same principle here - certificate prep
    // fields (dgFullNameOverride etc.) are DN-internal until notified/
    // collected. For now the certificate view itself is fine to share since
    // it's the postulant's own certificate, not another party's judgement.
    res.json(bundle);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function getPaymentQueue(_req: Request, res: Response): Promise<void> {
  try {
    const queue = await certificatesService.getPaymentQueue();
    res.json(queue);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function uploadInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const payment = await certificatesService.uploadInvoice(Number(req.params.phaseId), attachment, req.user!.userId);
    res.json(payment);
  } catch (error) {
    handleCertificatesError(res, error);
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
    const payment = await certificatesService.uploadPaymentProof(
      Number(req.params.phaseId),
      requestId,
      req.applicant!.applicantId,
      attachment
    );
    res.json(payment);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function validatePayment(req: Request, res: Response): Promise<void> {
  try {
    const result = await certificatesService.validatePayment(
      Number(req.params.phaseId),
      req.user!.userId
    );
    res.json(result);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function rejectPayment(req: Request, res: Response): Promise<void> {
  try {
    // K8 - action and trimmed reason checked before any lookup (400).
    const { rejectionAction, rejectionReason } = parsePaymentRejection(req.body);
    const payment = await certificatesService.rejectPayment(
      Number(req.params.phaseId),
      req.user!.userId,
      rejectionAction,
      rejectionReason
    );
    res.json(payment);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function updateFields(req: Request, res: Response): Promise<void> {
  try {
    const certificate = await certificatesService.updateCertificateFields(
      Number(req.params.certificateId),
      req.user!.userId,
      req.body ?? {}
    );
    res.json(certificate);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function overrideType(req: Request, res: Response): Promise<void> {
  try {
    const { certificateType } = req.body ?? {};
    if (!['agreement', 'recognition'].includes(certificateType)) {
      res.status(400).json({ message: "certificateType doit être 'agreement' ou 'recognition'." });
      return;
    }
    const certificate = await certificatesService.overrideCertificateType(
      Number(req.params.certificateId),
      req.user!.userId,
      certificateType
    );
    res.json(certificate);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function generateDocument(req: Request, res: Response): Promise<void> {
  try {
    const result = await certificatesService.generateCertificateDocument(
      Number(req.params.certificateId),
      req.user!.userId
    );
    res.json(result);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function printed(req: Request, res: Response): Promise<void> {
  try {
    const certificate = await certificatesService.markPrinted(
      Number(req.params.certificateId),
      req.user!.userId
    );
    res.json(certificate);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function signed(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const certificate = await certificatesService.markSigned(
      Number(req.params.certificateId),
      req.user!.userId,
      attachment
    );
    res.json(certificate);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function archived(req: Request, res: Response): Promise<void> {
  try {
    const certificate = await certificatesService.markArchived(
      Number(req.params.certificateId),
      req.user!.userId
    );
    res.json(certificate);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function notify(req: Request, res: Response): Promise<void> {
  try {
    const certificate = await certificatesService.notifyApplicant(
      Number(req.params.certificateId),
      req.user!.userId
    );
    res.json(certificate);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}

export async function collected(req: Request, res: Response): Promise<void> {
  try {
    const certificate = await certificatesService.markCollected(
      Number(req.params.certificateId),
      req.user!.userId
    );
    res.json(certificate);
  } catch (error) {
    handleCertificatesError(res, error);
  }
}
