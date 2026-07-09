import {
  attachMeetingReport,
  markMeetingStatus,
  rescheduleMeeting,
  scheduleMeeting,
  uploadFile,
} from '../api';
import { useAsyncAction } from './useAsyncAction';

export function useMeetingActions(
  setActionError: (message: string | null) => void,
  onChanged: () => void
) {
  const { busy, run } = useAsyncAction();

  async function schedule(params: {
    phaseId: number;
    dnAgentId: number;
    dateTime: string;
    location?: string;
  }): Promise<{ softOverlapWarning: boolean } | undefined> {
    setActionError(null);
    const result = await run(async () => {
      return await scheduleMeeting({
        phaseId: params.phaseId,
        dnAgentId: params.dnAgentId,
        scheduledAtIso: new Date(params.dateTime).toISOString(),
        location: params.location,
      });
    });

    if (result !== undefined) {
      onChanged();
      return result;
    }

    setActionError('Impossible de planifier la reunion.');
    return undefined;
  }

  async function reschedule(meetingId: number, dateTime: string): Promise<boolean> {
    setActionError(null);
    const result = await run(async () => {
      await rescheduleMeeting(meetingId, new Date(dateTime).toISOString());
    });

    if (result !== undefined) {
      onChanged();
      return true;
    }

    setActionError('Impossible de reprogrammer.');
    return false;
  }

  async function markStatus(
    meetingId: number,
    status: 'held' | 'no_show' | 'file_cancelled'
  ): Promise<boolean> {
    setActionError(null);
    const result = await run(async () => {
      await markMeetingStatus(meetingId, status);
    });

    if (result !== undefined) {
      onChanged();
      return true;
    }

    setActionError('Action impossible.');
    return false;
  }

  async function sendReport(meetingId: number, file: File): Promise<boolean> {
    setActionError(null);
    const result = await run(async () => {
      const uploaded = await uploadFile(file);
      await attachMeetingReport(meetingId, uploaded.fileUrl, uploaded.mimeType);
    });

    if (result !== undefined) {
      onChanged();
      return true;
    }

    setActionError("Impossible d'envoyer le compte-rendu.");
    return false;
  }

  return {
    busy,
    schedule,
    reschedule,
    markStatus,
    sendReport,
  };
}
