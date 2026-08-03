import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as reportsController from './reports.controller.js';

const router = Router();

router.use(authenticate, requireRole('dn_supervisor', 'SU'));
router.get('/', reportsController.list);
router.post('/generate', reportsController.generate);
router.get('/:id/download', reportsController.download);

export default router;
