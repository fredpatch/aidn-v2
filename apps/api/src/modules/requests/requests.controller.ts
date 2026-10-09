import { Request, Response } from 'express';
import * as requestsService from './requests.service.js';
import { handleRequestsError } from '../../shared/utils/error.js';
import { actorFromRequest, parseUploadAssetId, prepareUploadAttachment } from '../uploads/upload-attachment.js';

const INTAKE_STAFF_ROLES = new Set(['reception', 'assistant_dg', 'SU']);

function hasIntakeStaffRole(roles: string[] | undefined): boolean {
  return roles?.some((role) => INTAKE_STAFF_ROLES.has(role)) ?? false;
}

export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const {
      requestType,
      message,
      uploadAssetId,
      applicantId: bodyApplicantId,
    } = req.body ?? {};

    // Applicant (portal, self-submission) - applicantId always comes from
    // their own session, never trusted from the request body.
    // Staff (reception/assistant_dg, manual entry for a physical drop-off)
    // - must specify which applicant this demande is for.
    let applicantId: number;
    let submittedByUserId: number | undefined;

    if (req.applicant) {
      applicantId = req.applicant.applicantId;
    } else if (req.user) {
      if (!hasIntakeStaffRole(req.user.roles)) {
        res.status(403).json({ message: 'Accès refusé pour ce rôle.' });
        return;
      }
      if (!bodyApplicantId) {
        res.status(400).json({ message: 'applicantId requis pour une saisie manuelle.' });
        return;
      }
      applicantId = Number(bodyApplicantId);
      submittedByUserId = req.user.userId;
    } else {
      res.status(401).json({ message: 'Non authentifié.' });
      return;
    }

    if (!requestType) {
      res.status(400).json({ message: 'requestType est requis.' });
      return;
    }

    // STORAGE-0B - only the upload id is read; address and type come from
    // the asset, which must have been uploaded by this same actor.
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));

    const result = await requestsService.submitRequest({
      applicantId,
      requestType,
      message,
      attachment,
      submittedByUserId,
    });

    res.status(201).json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.getRequest(Number(req.params.id));
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.query;
    const result = await requestsService.listRequests({ status: status as string | undefined });
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function cockpit(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.listRequestCockpit(req.user!.userId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

/** D3b - the reading pane opened this dossier (204, no body). */
export async function markViewed(req: Request, res: Response): Promise<void> {
  try {
    await requestsService.markRequestViewed(Number(req.params.id), req.user!.userId);
    res.status(204).end();
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function markSigned(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.markSigned(Number(req.params.id), req.user!.userId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function sendToSignature(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.sendToSignature(Number(req.params.id), req.user!.userId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function confirmPrintedForSignature(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.sendToSignature(Number(req.params.id), req.user!.userId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function markPendingReview(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.markPendingReview(Number(req.params.id), req.user!.userId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function returnSignedFromDg(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const result = await requestsService.returnSignedFromDg(Number(req.params.id), attachment, req.user!.userId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  try {
    if (req.user && !hasIntakeStaffRole(req.user.roles)) {
      res.status(403).json({ message: 'Accès refusé pour ce rôle.' });
      return;
    }

    const result = await requestsService.cancelRequest(Number(req.params.id), {
      userId: req.user?.userId,
      applicantId: req.applicant?.applicantId,
    });
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function mine(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.listRequestsByApplicant(req.applicant!.applicantId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function replaceDocument(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    await requestsService.replaceCircuitDocument(Number(req.params.id), attachment, req.user!.userId);
    res.status(204).send();
  } catch (error) {
    handleRequestsError(res, error);
  }
}
