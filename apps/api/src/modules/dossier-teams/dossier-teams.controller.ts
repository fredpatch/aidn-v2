import type { Request, Response } from 'express';
import { handleDossierTeamError } from '../../shared/utils/error.js';
import * as service from './dossier-teams.service.js';
import { parseTeamProposal } from './dossier-teams.input.js';

function requestId(req: Request) {
  const value = req.params.requestId;
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new Error('REQUEST_NOT_FOUND');
  return id;
}

export async function read(req: Request, res: Response): Promise<void> {
  try {
    res.json(await service.getDossierTeam(requestId(req)));
  } catch (error) {
    handleDossierTeamError(res, error);
  }
}

export async function eligible(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await service.getEligibleMembers());
  } catch (error) {
    handleDossierTeamError(res, error);
  }
}

export async function save(req: Request, res: Response): Promise<void> {
  try {
    const input = parseTeamProposal(req.body);
    res.json(await service.saveTeamProposal(requestId(req), req.user!.userId, input));
  } catch (error) {
    handleDossierTeamError(res, error);
  }
}
