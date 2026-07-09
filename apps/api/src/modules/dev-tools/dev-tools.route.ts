import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as devToolsController from './dev-tools.controller.js';

const router = Router();

router.use(authenticate, requireRole('SU'));

router.get('/status', devToolsController.status);
router.post('/reset', devToolsController.reset);

export default router;
