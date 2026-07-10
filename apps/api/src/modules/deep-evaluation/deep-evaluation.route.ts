import { Router } from 'express';
import {
  authenticate,
  authenticateEither,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as evalController from './deep-evaluation.controller.js';

const router = Router();

// Bundle — both sides
router.get('/by-request/:requestId', authenticateEither, evalController.getBundle);

// Open M5 — DN/SU
router.post(
  '/requests/:requestId/start-deep-evaluation',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  evalController.openPhase
);

// Invoice — S5 or DN/SU upload
router.post(
  '/phases/:phaseId/invoice',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  evalController.uploadInvoice
);

// Proof of payment — either auth (portal = applicant, admin = staff on behalf)
router.post(
  '/phases/:phaseId/requests/:requestId/proof',
  authenticateEither,
  evalController.uploadProof
);

// Validate/reject proof — S5 or DN/SU
router.post(
  '/phases/:phaseId/payment/validate',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  evalController.validatePayment
);
router.post(
  '/phases/:phaseId/payment/reject',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  evalController.rejectPayment
);

// Verdicts — DN only
router.patch(
  '/evaluations/:evaluationId/verdict',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  evalController.setVerdict
);

// Resubmit corrected doc — either auth
router.post(
  '/evaluations/:evaluationId/resubmit',
  authenticateEither,
  evalController.resubmitDocument
);

// Close M5 — DN/SU
router.post(
  '/phases/:phaseId/close',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  evalController.closePhase
);

export default router;
