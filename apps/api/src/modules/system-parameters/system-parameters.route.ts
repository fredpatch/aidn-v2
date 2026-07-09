import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as parametersController from './system-parameters.controller.js';

const router = Router();

router.use(authenticate, requireRole('SU'));

router.get('/', parametersController.list);
router.patch('/:key', parametersController.update);

export default router;
