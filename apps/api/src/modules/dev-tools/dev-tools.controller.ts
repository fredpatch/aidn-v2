import { Request, Response } from 'express';
import * as devToolsService from './dev-tools.service.js';
import { handleDevToolsError } from '../../shared/utils/error.js';

export async function status(req: Request, res: Response): Promise<void> {
  res.json(devToolsService.getStatus(req.user!.userId));
}

export async function startSession(req: Request, res: Response): Promise<void> {
  try {
    const { durationMinutes } = req.body ?? {};
    const session = await devToolsService.startMaintenanceSession(
      req.user!.userId,
      Number(durationMinutes)
    );
    res.json({ session });
  } catch (error) {
    handleDevToolsError(res, error);
  }
}

export async function reset(req: Request, res: Response): Promise<void> {
  try {
    const { scopes, confirmation } = req.body ?? {};
    if (!Array.isArray(scopes) || scopes.length === 0) {
      res.status(400).json({ message: 'scopes (tableau non vide) requis.' });
      return;
    }
    const result = await devToolsService.resetData(scopes, req.user!.userId, confirmation);
    res.json(result);
  } catch (error) {
    handleDevToolsError(res, error);
  }
}
