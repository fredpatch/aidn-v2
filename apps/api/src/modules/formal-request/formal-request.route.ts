import { Router } from 'express';
import {
  authenticate,
  authenticateEither,
  requireApplicantOrRole,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as formalController from './formal-request.controller.js';

const router = Router();

// Bundle — both sides need to read their dossier's M4 state
router.get(
  '/by-request/:requestId',
  authenticateEither,
  requireApplicantOrRole('dn_agent', 'dn_supervisor', 'SU'),
  formalController.getBundle
);

// Open M4 phase — DN/SU only
router.post(
  '/requests/:requestId/start-formal-phase',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  formalController.openPhase
);

// Formal letter Circuit DG — submit is either auth (portal self-submit or
// admin on behalf), circuit actions are staff only
router.post('/requests/:requestId/letter', authenticateEither, formalController.submitLetter);
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

// Document slot upload — either auth (applicant primary, staff fallback)
router.post('/requests/:requestId/documents', authenticateEither, formalController.submitDocument);

// Close M4 — DN/SU only
router.post(
  '/phases/:phaseId/close',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  formalController.closePhase
);

export default router;
