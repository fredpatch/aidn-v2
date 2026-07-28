import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as courrierTasksController from './courrier-tasks.controller.js';

const router = Router();

router.use(authenticate, requireRole('reception', 'assistant_dg', 'SU'));

router.get('/', courrierTasksController.list);
router.post('/:taskId/confirm-printed-for-signature', courrierTasksController.confirmPrintedForSignature);
router.post('/:taskId/return-signed', courrierTasksController.returnSigned);

export default router;
