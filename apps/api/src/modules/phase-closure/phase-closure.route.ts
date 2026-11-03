import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as phaseClosureController from './phase-closure.controller.js';

/** WORKFLOW-FOUNDATION-1A - the closure courrier of a phase. Commands only,
 *  no status mutation: DN authority deposits it (dn_supervisor, not
 *  dn_agent); Reception / Assistant DG run the signature circuit, as for
 *  every other courrier (courrier-tasks). */
const router = Router();

router.get(
  '/phases/:phaseId',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'reception', 'assistant_dg', 'SU'),
  phaseClosureController.getForPhase
);
router.post('/phases/:phaseId', authenticate, requireRole('dn_supervisor', 'SU'), phaseClosureController.start);
router.post(
  '/:id/in-circuit',
  authenticate,
  requireRole('reception', 'assistant_dg', 'SU'),
  phaseClosureController.markInCircuit
);
router.post('/:id/return', authenticate, requireRole('reception', 'assistant_dg', 'SU'), phaseClosureController.recordReturn);

export default router;
