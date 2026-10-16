import type { Request, Response } from 'express';
import { getFinanceQueue } from './finance-queue.js';

export async function financeQueue(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getFinanceQueue());
  } catch (error) {
    console.error('[payments/finance-queue]', error);
    res.status(500).json({ message: 'Impossible de charger la file Finance.' });
  }
}
