import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as paymentsController from './payments.controller.js';

const router = Router();
router.get('/finance-queue', authenticate, requireRole('s5_agent', 'SU'), paymentsController.financeQueue);
export default router;
