import { Router } from 'express';
import {
  authenticate,
  authenticateEither,
  requireApplicant,
  requireApplicantOrRole,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as formalController from './formal-request.controller.js';

const router = Router();

// Bundle - both sides need to read their dossier's M4 state
router.get(
  '/by-request/:requestId',
  authenticateEither,
  requireApplicantOrRole('dn_agent', 'dn_supervisor', 'SU'),
  formalController.getBundle
);

// Open M4 phase - DN/SU only
router.post(
  '/requests/:requestId/start-formal-phase',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  formalController.openPhase
);

// Formal letter Circuit DG - submit by the applicant (portal) or by DN/SU on
// their behalf (admin M4 page); circuit actions are staff only
router.post(
  '/requests/:requestId/letter',
  authenticateEither,
  requireApplicantOrRole('dn_agent', 'dn_supervisor', 'SU'),
  formalController.submitLetter
);
router.post(
  '/requests/:requestId/letter/mark-signed',
  authenticate,
  requireRole('reception', 'assistant_dg', 'SU'),
  formalController.markSigned
);
router.post(
  '/requests/:requestId/letter/mark-pending-review',
  authenticate,
  requireRole('reception', 'assistant_dg', 'SU'),
  formalController.markPendingReview
);

// Document slot upload - the applicant only (one-shot per slot)
router.post('/requests/:requestId/documents', authenticateEither, requireApplicant, formalController.submitDocument);

// Close M4 - DN/SU only
router.post(
  '/phases/:phaseId/close',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  formalController.closePhase
);

export default router;
