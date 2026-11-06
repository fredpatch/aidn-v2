import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as controller from './dossier-teams.controller.js';

const router = Router();
router.get(
  '/requests/:requestId/team',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  controller.read
);
router.put(
  '/requests/:requestId/team-proposal',
  authenticate,
  requireRole('dn_supervisor', 'SU'),
  controller.save
);
router.get(
  '/dossier-teams/eligible-members',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  controller.eligible
);
export default router;
