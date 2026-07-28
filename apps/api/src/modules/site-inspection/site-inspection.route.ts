import { Router } from 'express';
import {
  authenticate,
  authenticateEither,
  requireApplicantOrRole,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as inspectionController from './site-inspection.controller.js';

const router = Router();

// R3's own dossier queue — r3_agent only, scoped to their assigned visits
router.get(
  '/my-queue',
  authenticate,
  requireRole('r3_agent', 'SU'),
  inspectionController.getMyQueue
);

// Bundle — both sides
router.get(
  '/by-request/:requestId',
  authenticateEither,
  requireApplicantOrRole('dn_agent', 'dn_supervisor', 'SU'),
  inspectionController.getBundle
);

// Open M6 — DN/SU
router.post(
  '/requests/:requestId/start-site-inspection',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  inspectionController.openPhase
);

// Invoice — S5 or DN/SU (identical to M5 per feasibility doc)
router.post(
  '/phases/:phaseId/invoice',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  inspectionController.uploadInvoice
);

// Proof of payment — either auth
router.post(
  '/phases/:phaseId/requests/:requestId/proof',
  authenticateEither,
  inspectionController.uploadProof
);

// Validate/reject proof — S5 or DN/SU
router.post(
  '/phases/:phaseId/payment/validate',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  inspectionController.validatePayment
);
router.post(
  '/phases/:phaseId/payment/reject',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  inspectionController.rejectPayment
);

// Site visit scheduling — DN plans it, per feasibility doc (not R3)
router.post(
  '/phases/:phaseId/site-visit',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  inspectionController.scheduleSiteVisit
);

// R3 verdict — R3 only, auto-closes the phase
router.post(
  '/phases/:phaseId/verdict',
  authenticate,
  requireRole('r3_agent', 'SU'),
  inspectionController.submitVerdict
);

export default router;
