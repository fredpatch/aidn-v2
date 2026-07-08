import { Request, Response } from "express";
import * as requestsService from "./requests.service.js";
import { handleRequestsError } from "../../shared/utils/error.js";

export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const { requestType, message, fileUrl, mimeType, applicantId: bodyApplicantId } = req.body ?? {};

    // Applicant (portal, self-submission) - applicantId always comes from
    // their own session, never trusted from the request body.
    // Staff (reception/assistant_dg, manual entry for a physical drop-off)
    // - must specify which applicant this demande is for.
    let applicantId: number;
    let submittedByUserId: number | undefined;

    if (req.applicant) {
      applicantId = req.applicant.applicantId;
    } else if (req.user) {
      if (!bodyApplicantId) {
        res.status(400).json({ message: "applicantId requis pour une saisie manuelle." });
        return;
      }
      applicantId = Number(bodyApplicantId);
      submittedByUserId = req.user.userId;
    } else {
      res.status(401).json({ message: "Non authentifie." });
      return;
    }

    if (!requestType || !fileUrl || !mimeType) {
      res.status(400).json({ message: "requestType, fileUrl et mimeType sont requis." });
      return;
    }

    const result = await requestsService.submitRequest({
      applicantId,
      requestType,
      message,
      fileUrl,
      mimeType,
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

export async function markSigned(req: Request, res: Response): Promise<void> {
  try {
    const result = await requestsService.markSigned(Number(req.params.id), req.user!.userId);
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

export async function cancel(req: Request, res: Response): Promise<void> {
  try {
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
    const { fileUrl, mimeType } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: "fileUrl et mimeType sont requis." });
      return;
    }
    await requestsService.replaceCircuitDocument(
      Number(req.params.id),
      fileUrl,
      mimeType,
      req.user!.userId
    );
    res.status(204).send();
  } catch (error) {
    handleRequestsError(res, error);
  }
}
