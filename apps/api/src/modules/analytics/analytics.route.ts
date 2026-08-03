import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as analyticsController from './analytics.controller.js';

const router = Router();

router.use(authenticate, requireRole('dn_supervisor', 'SU'));
router.get('/overview', analyticsController.overview);

export default router;
