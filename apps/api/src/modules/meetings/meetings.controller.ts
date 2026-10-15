import { Request, Response } from 'express';
import { z } from 'zod';
import * as meetingsService from './meetings.service.js';
import * as negotiationService from './meeting-negotiation.service.js';
import * as signedReportService from './meeting-signed-report.service.js';
import { handleMeetingsError } from '../../shared/utils/error.js';
import { actorFromRequest, parseUploadAssetId, prepareUploadAttachment } from '../uploads/upload-attachment.js';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const summary = await meetingsService.listMeetingCockpit({
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      meetingType: typeof req.query.meetingType === 'string' ? req.query.meetingType : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      phaseCode: typeof req.query.phaseCode === 'string' ? req.query.phaseCode : undefined,
      confirmation: typeof req.query.confirmation === 'string' ? req.query.confirmation : undefined,
    });
    res.json(summary);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

/** GET /meetings/mine - applicant only; scope comes from the token, never from the query. */
export async function mine(req: Request, res: Response): Promise<void> {
  try {
    const items = await meetingsService.listApplicantMeetings(req.applicant!.applicantId);
    res.json(items);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

export async function schedule(req: Request, res: Response): Promise<void> {
  try {
    const { phaseId, meetingType, dnAgentId, scheduledAt, location } = req.body ?? {};
    if (!phaseId || !meetingType || !dnAgentId || !scheduledAt) {
      res
        .status(400)
        .json({ message: 'phaseId, meetingType, dnAgentId et scheduledAt sont requis.' });
      return;
    }
    const result = await meetingsService.scheduleMeeting({
      phaseId: Number(phaseId),
      meetingType,
      dnAgentId: Number(dnAgentId),
      scheduledAt,
      location,
      actorUserId: req.user!.userId,
    });
    res.status(201).json(result);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const meeting = await meetingsService.getMeeting(Number(req.params.id), {
      applicant: req.applicant,
      user: req.user,
    });
    res.json(meeting);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

/** GET /meetings/:id/ticket - the invitation as a PDF (same URL as the former HTML ticket). */
export async function ticket(req: Request, res: Response): Promise<void> {
  try {
    const { pdf, fileName } = await meetingsService.getMeetingInvitationPdf(Number(req.params.id), {
      applicant: req.applicant,
      user: req.user,
    });
    // inline: opens in the browser's PDF viewer (print / download from there).
    res
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', `inline; filename="${fileName}"`)
      .set('Cache-Control', 'private, no-store')
      .send(pdf);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

export async function markStatus(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.body ?? {};
    if (!['held', 'no_show', 'file_cancelled'].includes(status)) {
      res.status(400).json({ message: 'Statut invalide (held, no_show ou file_cancelled).' });
      return;
    }
    const meeting = await meetingsService.markMeetingStatus(
      Number(req.params.id),
      req.user!.userId,
      status
    );
    res.json(meeting);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

export async function reschedule(req: Request, res: Response): Promise<void> {
  try {
    const { newScheduledAt, remark } = req.body ?? {};
    if (!newScheduledAt) {
      res.status(400).json({ message: 'newScheduledAt requis.' });
      return;
    }
    const result = await meetingsService.rescheduleMeeting(
      Number(req.params.id),
      req.user!.userId,
      newScheduledAt,
      typeof remark === 'string' ? remark : undefined
    );
    res.status(201).json(result);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

export async function attachReport(req: Request, res: Response): Promise<void> {
  try {
    const { uploadAssetId } = req.body ?? {};
    const attachment = await prepareUploadAttachment(parseUploadAssetId(uploadAssetId), actorFromRequest(req));
    const meeting = await meetingsService.attachMeetingReport(Number(req.params.id), req.user!.userId, attachment);
    res.json(meeting);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

// ── SESSION1-MEET-1 - negotiation commands ──────────────────────────────
// Strict bodies: an unknown key (dnAgentId, status, location...) is a 400,
// so a client can never slip a DN-only field into an applicant command.
const text = z.string().trim().min(1).max(1000);
const emptyBody = z.object({}).strict();
const proposeAlternateBody = z
  .object({ scheduledAt: z.string().datetime({ offset: true }), remark: text })
  .strict();
const refuseBody = z.object({ reason: text }).strict();
const onBehalfBody = z.object({ note: text }).strict();

// SESSION1-MEET-2 - the applicant names only the uploaded file; the meeting is
// the URL, the applicant the token.
const signedReportBody = z.object({ uploadAssetId: z.union([z.number(), z.string()]) }).strict();

function parseBody<T>(schema: z.ZodType<T>, req: Request, res: Response, message: string): T | null {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data;
  res.status(400).json({ message, code: 'VALIDATION_ERROR' });
  return null;
}

/** POST /meetings/:id/confirm - applicant only, own meeting. */
export async function confirm(req: Request, res: Response): Promise<void> {
  try {
    if (!parseBody(emptyBody, req, res, 'Aucun paramètre attendu.')) return;
    const applicant = req.applicant!;
    const meetingId = Number(req.params.id);
    await negotiationService.confirmMeeting(meetingId, applicant.applicantId);
    res.json(await meetingsService.getMeeting(meetingId, { applicant }));
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

/** POST /meetings/:id/propose-alternate - applicant only, own meeting. */
export async function proposeAlternate(req: Request, res: Response): Promise<void> {
  try {
    const body = parseBody(
      proposeAlternateBody,
      req,
      res,
      'Date et heure proposées (avec fuseau horaire) et remarque obligatoires.'
    );
    if (!body) return;
    const applicant = req.applicant!;
    const meetingId = Number(req.params.id);
    await negotiationService.proposeAlternate(meetingId, applicant.applicantId, body);
    res.json(await meetingsService.getMeeting(meetingId, { applicant }));
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

/** POST /meetings/:id/signed-report - applicant only, own held M3/M4 meeting
 *  with a DN compte-rendu (SESSION1-MEET-2). Once: a second file is a 409. */
export async function submitSignedReport(req: Request, res: Response): Promise<void> {
  try {
    const body = parseBody(signedReportBody, req, res, 'Seul le fichier téléversé (uploadAssetId) est attendu.');
    if (!body) return;
    const applicant = req.applicant!;
    const attachment = await prepareUploadAttachment(parseUploadAssetId(body.uploadAssetId), {
      kind: 'applicant',
      applicantId: applicant.applicantId,
    });
    const meetingId = Number(req.params.id);
    await signedReportService.submitSignedMeetingReport(meetingId, applicant.applicantId, attachment);
    res.json(await meetingsService.getMeeting(meetingId, { applicant }));
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

/** POST /meetings/:id/alternate/accept - DN; accepts the stored proposal. */
export async function acceptAlternate(req: Request, res: Response): Promise<void> {
  try {
    if (!parseBody(emptyBody, req, res, 'Aucun paramètre attendu : la date acceptée est celle proposée.')) return;
    const { meeting, softOverlapWarning } = await negotiationService.acceptAlternate(
      Number(req.params.id),
      req.user!.userId
    );
    res.json({ meeting: await meetingsService.getMeeting(meeting.id, { user: req.user }), softOverlapWarning });
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

/** POST /meetings/:id/alternate/refuse - DN, mandatory reason. */
export async function refuseAlternate(req: Request, res: Response): Promise<void> {
  try {
    const body = parseBody(refuseBody, req, res, 'Le motif du refus est obligatoire.');
    if (!body) return;
    const meetingId = Number(req.params.id);
    await negotiationService.refuseAlternate(meetingId, req.user!.userId, body.reason);
    res.json(await meetingsService.getMeeting(meetingId, { user: req.user }));
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

/** POST /meetings/:id/confirm-on-behalf - DN, mandatory note. */
export async function confirmOnBehalf(req: Request, res: Response): Promise<void> {
  try {
    const body = parseBody(onBehalfBody, req, res, 'Merci de préciser comment la confirmation a été reçue.');
    if (!body) return;
    const meetingId = Number(req.params.id);
    await negotiationService.confirmOnBehalf(meetingId, req.user!.userId, body.note);
    res.json(await meetingsService.getMeeting(meetingId, { user: req.user }));
  } catch (error) {
    handleMeetingsError(res, error);
  }
}
