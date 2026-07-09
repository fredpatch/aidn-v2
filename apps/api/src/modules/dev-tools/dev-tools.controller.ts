import { Request, Response } from 'express';
import * as devToolsService from './dev-tools.service.js';
import { handleDevToolsError } from '../../shared/utils/error.js';

export async function status(_req: Request, res: Response): Promise<void> {
  res.json({
    enabled: process.env.ENABLE_DEV_RESET === 'true',
    scopes: devToolsService.RESETTABLE_SCOPES,
    labels: devToolsService.SCOPE_LABELS,
  });
}

export async function reset(req: Request, res: Response): Promise<void> {
  try {
    const { scopes } = req.body ?? {};
    if (!Array.isArray(scopes) || scopes.length === 0) {
      res.status(400).json({ message: 'scopes (tableau non vide) requis.' });
      return;
    }
    const result = await devToolsService.resetData(scopes, req.user!.userId);
    res.json(result);
  } catch (error) {
    handleDevToolsError(res, error);
  }
}
