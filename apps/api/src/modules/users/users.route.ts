import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as usersController from './users.controller.js';

const router = Router();

// Narrow, least-privilege lookup for agent pickers (e.g. M6 site visit
// scheduling needs to list r3_agent users) - not gated SU-only like the rest
// of this module, but still staff-only and returns minimal fields only.
router.get(
  '/by-role/:role',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 's5_agent', 'SU'),
  usersController.listByRole
);

router.use(authenticate);

// User listing and role assignment are available to SU and DN supervisors.
router.get('/summary', requireRole('SU', 'dn_supervisor'), usersController.summary);
router.get('/', requireRole('SU', 'dn_supervisor'), usersController.list);
router.get('/:id', requireRole('SU', 'dn_supervisor'), usersController.get);
router.patch('/:id/roles', requireRole('SU', 'dn_supervisor'), usersController.updateRoles);

// Full account lifecycle remains SU-only.
router.use(requireRole('SU'));

router.post('/', usersController.create);
router.patch('/:id', usersController.update);
router.patch('/:id/activation', usersController.toggleActivation);
router.post('/:id/reset-otp', usersController.resetOTP);

export default router;
