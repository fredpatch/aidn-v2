import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import * as certificatesService from './certificates.service.js';
import { handleCertificatesError } from '../../shared/utils/error.js';

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

export async function uploadInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: 'fileUrl et mimeType sont requis.' });
      return;
    }
    const payment = await certificatesService.uploadInvoice(
      Number(req.params.phaseId),
      fileUrl,
      mimeType,
      req.user!.userId,
      parseUploadAssetId(uploadAssetId)
    );
    res.json(payment);
  } catch (error) {
    handleCertificatesError(res, error);
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
    const payment = await certificatesService.uploadPaymentProof(
      Number(req.params.phaseId),
      fileUrl,
      mimeType,
      req.user?.userId ?? req.applicant?.applicantId,
      parseUploadAssetId(uploadAssetId)
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
    const { rejectionAction, rejectionReason } = req.body ?? {};
    if (!rejectionAction || !rejectionReason) {
      res.status(400).json({ message: 'rejectionAction et rejectionReason sont requis.' });
      return;
    }
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
    const certificate = await certificatesService.markSigned(
      Number(req.params.certificateId),
      req.user!.userId
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
