import { Router } from 'express';
import {
  authenticate,
  authenticateEither,
  requireApplicantOrRole,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as certificatesController from './certificates.controller.js';

const router = Router();

// Bundle — both sides (postulant can see their own certificate's status/content)
router.get(
  '/by-request/:requestId',
  authenticateEither,
  requireApplicantOrRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.getBundle
);

// Open M7 — DN/SU
router.post(
  '/requests/:requestId/start-delivery',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.openPhase
);

// Invoice — S5 or DN/SU (identical to M5/M6)
router.post(
  '/phases/:phaseId/invoice',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.uploadInvoice
);

// Proof of payment — either auth
router.post(
  '/phases/:phaseId/requests/:requestId/proof',
  authenticateEither,
  certificatesController.uploadProof
);

// Validate/reject proof — S5 or DN/SU. Validation is where the certificate
// row gets created.
router.post(
  '/phases/:phaseId/payment/validate',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.validatePayment
);
router.post(
  '/phases/:phaseId/payment/reject',
  authenticate,
  requireRole('s5_agent', 'dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.rejectPayment
);

// DN data entry — header fields, scope details, type override. Only while
// the certificate is still 'in_preparation' (enforced in the service).
router.patch(
  '/:certificateId/fields',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.updateFields
);
router.post(
  '/:certificateId/type',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.overrideType
);

// Generate the filled certificate document (Puppeteer render)
router.post(
  '/:certificateId/generate',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.generateDocument
);

// Status lifecycle — DN/SU
router.post(
  '/:certificateId/printed',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.printed
);
router.post(
  '/:certificateId/signed',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.signed
);
router.post(
  '/:certificateId/archived',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.archived
);
router.post(
  '/:certificateId/notify',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.notify
);
router.post(
  '/:certificateId/collected',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  certificatesController.collected
);

export default router;
