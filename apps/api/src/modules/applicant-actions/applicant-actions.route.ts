import { Router } from 'express';
import { authenticateApplicant } from '../../shared/guards/auth.middleware.js';
import * as applicantActionsController from './applicant-actions.controller.js';

const router = Router();

// SESSION1-UX-1 - everything AIDN expects from the signed-in applicant.
router.get('/', authenticateApplicant, applicantActionsController.mine);

export default router;
