import { Request, Response } from 'express';
import { getDashboardSummary } from './dashboard.service.js';
import type { DashboardPeriod } from './dashboard.types.js';

const PERIODS = new Set(['this_month', 'last_30_days', 'quarter', 'year']);

export async function summary(req: Request, res: Response): Promise<void> {
  const rawPeriod = typeof req.query.period === 'string' ? req.query.period : 'this_month';
  const period = PERIODS.has(rawPeriod) ? (rawPeriod as DashboardPeriod) : 'this_month';
  const data = await getDashboardSummary(period);
  res.json(data);
}
