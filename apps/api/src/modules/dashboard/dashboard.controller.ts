import { Request, Response } from 'express';
import {
  getDashboardSummary,
  getR3DashboardSummary,
  getReceptionDashboardSummary,
  getS5DashboardSummary,
} from './dashboard.service.js';
import type { DashboardPeriod } from './dashboard.types.js';

const PERIODS = new Set(['this_month', 'last_30_days', 'quarter', 'year']);

export async function summary(req: Request, res: Response): Promise<void> {
  const rawPeriod = typeof req.query.period === 'string' ? req.query.period : 'this_month';
  const period = PERIODS.has(rawPeriod) ? (rawPeriod as DashboardPeriod) : 'this_month';
  const data = await getDashboardSummary(period, req.user?.roles ?? []);
  res.json(data);
}

export async function s5Summary(req: Request, res: Response): Promise<void> {
  const rawPeriod = typeof req.query.period === 'string' ? req.query.period : 'this_month';
  const period = PERIODS.has(rawPeriod) ? (rawPeriod as DashboardPeriod) : 'this_month';
  const data = await getS5DashboardSummary(period);
  res.json(data);
}

export async function receptionSummary(req: Request, res: Response): Promise<void> {
  const rawPeriod = typeof req.query.period === 'string' ? req.query.period : 'this_month';
  const period = PERIODS.has(rawPeriod) ? (rawPeriod as DashboardPeriod) : 'this_month';
  const data = await getReceptionDashboardSummary(period);
  res.json(data);
}

export async function r3Summary(req: Request, res: Response): Promise<void> {
  const rawPeriod = typeof req.query.period === 'string' ? req.query.period : 'this_month';
  const period = PERIODS.has(rawPeriod) ? (rawPeriod as DashboardPeriod) : 'this_month';
  const roles = req.user?.roles ?? [];
  const data = await getR3DashboardSummary(period, req.user!.userId, roles.includes('SU'));
  res.json(data);
}
