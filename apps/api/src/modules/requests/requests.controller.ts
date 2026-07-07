import { Request, Response } from "express";
import * as requestsService from "./requests.service.js";
import { handleRequestsError } from "../../shared/utils/error.js";

export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const { applicantId, requestType, message, fileUrl, mimeType } = req.body;

    if (!applicantId || !requestType || !fileUrl || !mimeType) {
      res.status(400).json({
        message: "applicantId, requestType, fileUrl et mimeType sont requis.",
      });
      return;
    }

    const result = await requestsService.submitRequest({
      applicantId: Number(applicantId),
      requestType,
      message,
      fileUrl,
      mimeType,
      // Present when reception/assistant_dg enters a physical drop-off manually;
      // absent for a genuine portal self-submission.
      submittedByUserId: req.user?.userId,
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
    const result = await requestsService.cancelRequest(Number(req.params.id), req.user!.userId);
    res.json(result);
  } catch (error) {
    handleRequestsError(res, error);
  }
}

export async function replaceDocument(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl, mimeType } = req.body;
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
