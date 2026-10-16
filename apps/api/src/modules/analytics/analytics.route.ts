import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as analyticsController from './analytics.controller.js';

const router = Router();

// ROLE-ANALYTICS-1B - guards are per route: the global overview stays
// DN supervisor / SU, the role analytics are open to their own roles
// (ROLE_ANALYTICS_ACCESS, checked in role-analytics.service).
router.use(authenticate);
router.get('/overview', requireRole('dn_supervisor', 'SU'), analyticsController.overview);
router.get('/roles/:domain', analyticsController.roleOverview);

export default router;
