import { Request, Response } from 'express';
import * as meetingsService from './meetings.service.js';
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
    const { newScheduledAt } = req.body ?? {};
    if (!newScheduledAt) {
      res.status(400).json({ message: 'newScheduledAt requis.' });
      return;
    }
    const result = await meetingsService.rescheduleMeeting(
      Number(req.params.id),
      req.user!.userId,
      newScheduledAt
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
