import { Request, Response } from 'express';
import { getAnalyticsOverview, parseAnalyticsFilters } from './analytics.service.js';

export async function overview(req: Request, res: Response): Promise<void> {
  const filters = parseAnalyticsFilters(req.query);
  const data = await getAnalyticsOverview(filters);
  res.json(data);
}
