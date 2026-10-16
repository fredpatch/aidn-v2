import type { Request, Response } from 'express';
import { handleRequestsError } from '../../shared/utils/error.js';
import * as applicantActionsService from './applicant-actions.service.js';

export async function mine(req: Request, res: Response): Promise<void> {
  try {
    res.json(await applicantActionsService.listApplicantActions(req.applicant!.applicantId));
  } catch (error) {
    handleRequestsError(res, error);
  }
}
