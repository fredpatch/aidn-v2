import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as accountRequestsController from './account-requests.controller.js';

const router = Router();

router.post('/', accountRequestsController.submit);

router.use(authenticate, requireRole('reception', 'assistant_dg', 'dn_agent', 'dn_supervisor', 'SU'));

router.get('/', accountRequestsController.list);
router.get('/applicants', accountRequestsController.listApplicants);
router.get('/organisations/search', accountRequestsController.searchOrganisations);
router.get('/:id', accountRequestsController.get);
router.post('/:id/approve', accountRequestsController.approve);
router.post('/:id/reject', accountRequestsController.reject);
router.patch('/applicants/:id/activation', accountRequestsController.setApplicantActive);

export default router;
