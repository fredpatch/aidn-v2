import { Request, Response } from 'express';
import { handleRoleAnalyticsError } from '../../shared/utils/error.js';
import { getAnalyticsOverview, parseAnalyticsFilters } from './analytics.service.js';
import { getRoleAnalyticsOverview } from './role-analytics.service.js';

export async function overview(req: Request, res: Response): Promise<void> {
  const filters = parseAnalyticsFilters(req.query);
  const data = await getAnalyticsOverview(filters);
  res.json(data);
}

/** ROLE-ANALYTICS-1B - GET /analytics/roles/:domain?scope=&period=&from=&to= */
export async function roleOverview(req: Request, res: Response): Promise<void> {
  try {
    const data = await getRoleAnalyticsOverview(
      {
        domain: req.params.domain,
        scope: req.query.scope,
        period: req.query.period,
        from: req.query.from,
        to: req.query.to,
      },
      { userId: req.user!.userId, roles: req.user!.roles }
    );
    res.json(data);
  } catch (error) {
    handleRoleAnalyticsError(res, error);
  }
}
