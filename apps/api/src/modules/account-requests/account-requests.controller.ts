import { Request, Response } from 'express';
import * as accountRequestsService from './account-requests.service.js';
import { handleAccountRequestsError } from '../../shared/utils/error.js';

export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const {
      organisationNameInput,
      legalAddress,
      requestedEmail,
      phone,
      originalApprovalNumber,
      contactFullName,
      contactEmail,
      contactPhone,
      password,
      formStartedAt,
      honeypot,
    } = req.body ?? {};

    if (
      !organisationNameInput ||
      !legalAddress ||
      !requestedEmail ||
      !contactFullName ||
      !contactEmail ||
      !password ||
      !formStartedAt
    ) {
      res.status(400).json({ message: 'Les informations organisme, contact et mot de passe sont requises.' });
      return;
    }

    const startedAt = new Date(formStartedAt);
    if (Number.isNaN(startedAt.getTime())) {
      res.status(400).json({ message: 'Date de formulaire invalide.' });
      return;
    }

    const result = await accountRequestsService.submitAccountRequest({
      organisationNameInput,
      legalAddress,
      requestedEmail,
      phone,
      originalApprovalNumber,
      contactFullName,
      contactEmail,
      contactPhone,
      password,
      formStartedAt: startedAt,
      honeypot,
    });

    res.status(201).json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.query;
    const result = await accountRequestsService.listAccountRequests(
      typeof status === 'string' ? status : 'pending'
    );
    res.json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const result = await accountRequestsService.getAccountRequest(Number(req.params.id));
    res.json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}

export async function approve(req: Request, res: Response): Promise<void> {
  try {
    const { organisationId, createOrganisation, contactOrder } = req.body ?? {};
    const parsedOrganisationId =
      organisationId === undefined || organisationId === null ? undefined : Number(organisationId);
    const result = await accountRequestsService.approveAccountRequest(Number(req.params.id), {
      reviewedBy: req.user!.userId,
      organisationId: parsedOrganisationId,
      createOrganisation: Boolean(createOrganisation),
      contactOrder: contactOrder ?? 'primary',
    });
    res.json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}

export async function reject(req: Request, res: Response): Promise<void> {
  try {
    const { rejectionReason } = req.body ?? {};
    const result = await accountRequestsService.rejectAccountRequest(Number(req.params.id), {
      reviewedBy: req.user!.userId,
      rejectionReason: rejectionReason ?? '',
    });
    res.json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}

export async function listApplicants(_req: Request, res: Response): Promise<void> {
  try {
    const result = await accountRequestsService.listApplicantAccounts();
    res.json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}

export async function searchOrganisations(req: Request, res: Response): Promise<void> {
  try {
    const { q } = req.query;
    const result = await accountRequestsService.searchOrganisations(typeof q === 'string' ? q : '');
    res.json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}

export async function setApplicantActive(req: Request, res: Response): Promise<void> {
  try {
    const { active } = req.body ?? {};
    const result = await accountRequestsService.setApplicantAccountActive(
      Number(req.params.id),
      Boolean(active),
      req.user!.userId
    );
    res.json(result);
  } catch (error) {
    handleAccountRequestsError(res, error);
  }
}
