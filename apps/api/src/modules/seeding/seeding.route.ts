import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as seedingController from './seeding.controller.js';

// SU « Paramètres → État du système ».
const router = Router();

router.use(authenticate, requireRole('SU'));

router.get('/status', seedingController.status);
router.post('/run', seedingController.run);

export default router;
