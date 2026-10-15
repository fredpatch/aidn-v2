import { Router } from 'express';
import {
  authenticate,
  authenticateApplicant,
  authenticateEither,
  requireApplicantOrRole,
  requireRole,
} from '../../shared/guards/auth.middleware.js';
import * as meetingsController from './meetings.controller.js';

const router = Router();

// Scheduling and status changes: dn_agent/dn_supervisor only (per Sprint 2
// decision - reception/assistant_dg's role stays scoped to the M1 parapheur).
router.post(
  '/',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.schedule
);
router.patch(
  '/:id/status',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.markStatus
);
router.post(
  '/:id/reschedule',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.reschedule
);
router.post(
  '/:id/report',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.attachReport
);

// SESSION1-MEET-1 - negotiation of an M3/M4 appointment. Explicit commands,
// never the generic status endpoint. DN side: same three roles as above.
router.post(
  '/:id/alternate/accept',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.acceptAlternate
);
router.post(
  '/:id/alternate/refuse',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.refuseAlternate
);
router.post(
  '/:id/confirm-on-behalf',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.confirmOnBehalf
);
// Applicant side: the only two applicant writes on meetings. Identity comes
// from the token; ownership is checked inside the transaction (404 otherwise).
router.post('/:id/confirm', authenticateApplicant, meetingsController.confirm);
router.post('/:id/propose-alternate', authenticateApplicant, meetingsController.proposeAlternate);

router.get(
  '/',
  authenticate,
  requireRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.list
);

// Applicant's own meetings across all their dossiers (portal "Mes réunions").
// Declared before '/:id' so "mine" is never parsed as a meeting id.
router.get('/mine', authenticateApplicant, meetingsController.mine);

// Read access: either side needs to see the meeting/ticket, but MEETINGS-IDOR
// scopes it - applicants always pass the middleware and are then
// ownership-checked by getMeetingForAuthorizedActor (meeting's own dossier
// only); staff must hold one of these roles (reception/assistant_dg/s5_agent
// have no meeting reason to read any dossier's meeting; r3_agent keeps its
// narrower, assignment-checked access through site-inspection only).
router.get(
  '/:id',
  authenticateEither,
  requireApplicantOrRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.get
);
router.get(
  '/:id/ticket',
  authenticateEither,
  requireApplicantOrRole('dn_agent', 'dn_supervisor', 'SU'),
  meetingsController.ticket
);

export default router;
