import { Request, Response } from 'express';
import * as meetingsService from './meetings.service.js';
import { handleMeetingsError } from '../../shared/utils/error.js';

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
    const meeting = await meetingsService.getMeeting(Number(req.params.id));
    res.json(meeting);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}

export async function ticket(req: Request, res: Response): Promise<void> {
  try {
    const html = await meetingsService.getMeetingTicketHtml(Number(req.params.id));
    res.type('html').send(html);
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
    const { fileUrl, mimeType, uploadAssetId } = req.body ?? {};
    if (!fileUrl || !mimeType) {
      res.status(400).json({ message: 'fileUrl et mimeType sont requis.' });
      return;
    }
    const parsedUploadAssetId =
      uploadAssetId === undefined || uploadAssetId === null ? undefined : Number(uploadAssetId);
    if (parsedUploadAssetId !== undefined && !Number.isInteger(parsedUploadAssetId)) {
      res.status(400).json({ message: 'uploadAssetId invalide.' });
      return;
    }
    const meeting = await meetingsService.attachMeetingReport(
      Number(req.params.id),
      req.user!.userId,
      fileUrl,
      mimeType,
      parsedUploadAssetId
    );
    res.json(meeting);
  } catch (error) {
    handleMeetingsError(res, error);
  }
}
