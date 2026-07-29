import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as dashboardController from './dashboard.controller.js';

const router = Router();

router.use(
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'reception', 'assistant_dg', 's5_agent', 'r3_agent', 'SU')
);
router.get('/summary', dashboardController.summary);
router.get('/s5-summary', requireRole('s5_agent', 'SU'), dashboardController.s5Summary);
router.get(
  '/reception-summary',
  requireRole('reception', 'assistant_dg', 'SU'),
  dashboardController.receptionSummary
);
router.get('/r3-summary', requireRole('r3_agent', 'SU'), dashboardController.r3Summary);

export default router;
