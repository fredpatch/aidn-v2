import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as dashboardController from './dashboard.controller.js';

const router = Router();

router.use(authenticate, requireRole('dn_agent', 'dn_supervisor', 'SU'));
router.get('/summary', dashboardController.summary);

export default router;
