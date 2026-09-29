import { Request, Response } from 'express';
import { db } from '../../shared/db/index.js';
import { handleSeedingError } from '../../shared/utils/error.js';
import { collectSystemStatus, createDbSystemStatusProbe } from './seeding.health.js';
import { runReferenceDataSeed } from './seeding.service.js';

/** Observes only. Unreachable database/storage are reported in the body
 *  (200), so the SU still sees what could be checked. */
export async function status(_req: Request, res: Response): Promise<void> {
  try {
    const systemStatus = await collectSystemStatus(createDbSystemStatusProbe(db));
    res.set('Cache-Control', 'no-store');
    res.json(systemStatus);
  } catch (error) {
    console.error('[system-status]', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
}

/** Creates missing reference data only - never modifies existing items. */
export async function run(req: Request, res: Response): Promise<void> {
  try {
    res.json(await runReferenceDataSeed(req.user!.userId));
  } catch (error) {
    handleSeedingError(res, error);
  }
}
