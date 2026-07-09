import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  attachMeetingReport,
  markMeetingStatus,
  rescheduleMeeting,
  scheduleFormalMeeting,
  uploadFile,
} from '../api';
import { apiErrorMessage } from '../../../../lib/axios';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useFormalMeetingActions(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  function invalidate() {
    if (requestId) {
      return queryClient.invalidateQueries({ queryKey: queryKeys.formal.bundle(requestId) });
    }
  }

  const scheduleMutation = useMutation({
    mutationFn: (params: {
      phaseId: number;
      dnAgentId: number;
      scheduledAtIso: string;
      location?: string;
    }) => scheduleFormalMeeting(params),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de planifier la réunion.')),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ meetingId, dateTime }: { meetingId: number; dateTime: string }) =>
      rescheduleMeeting(meetingId, new Date(dateTime).toISOString()),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de reprogrammer.')),
  });

  const markStatusMutation = useMutation({
    mutationFn: ({
      meetingId,
      status,
    }: {
      meetingId: number;
      status: 'held' | 'no_show' | 'file_cancelled';
    }) => markMeetingStatus(meetingId, status),
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, 'Action impossible.')),
  });

  const sendReportMutation = useMutation({
    mutationFn: async ({ meetingId, file }: { meetingId: number; file: File }) => {
      const uploaded = await uploadFile(file);
      await attachMeetingReport(meetingId, uploaded.fileUrl, uploaded.mimeType);
    },
    onSuccess: invalidate,
    onError: (err) => setActionError(apiErrorMessage(err, "Impossible d'envoyer le compte-rendu.")),
  });

  const busy =
    scheduleMutation.isPending ||
    rescheduleMutation.isPending ||
    markStatusMutation.isPending ||
    sendReportMutation.isPending;

  async function schedule(params: {
    phaseId: number;
    dnAgentId: number;
    dateTime: string;
    location?: string;
  }) {
    setActionError(null);
    try {
      const result = await scheduleMutation.mutateAsync({
        phaseId: params.phaseId,
        dnAgentId: params.dnAgentId,
        scheduledAtIso: new Date(params.dateTime).toISOString(),
        location: params.location,
      });
      return result as { softOverlapWarning: boolean } | undefined;
    } catch {
      return undefined;
    }
  }

  async function reschedule(meetingId: number, dateTime: string): Promise<boolean> {
    setActionError(null);
    try {
      await rescheduleMutation.mutateAsync({ meetingId, dateTime });
      return true;
    } catch {
      return false;
    }
  }

  async function markStatus(
    meetingId: number,
    status: 'held' | 'no_show' | 'file_cancelled'
  ): Promise<boolean> {
    setActionError(null);
    try {
      await markStatusMutation.mutateAsync({ meetingId, status });
      return true;
    } catch {
      return false;
    }
  }

  async function sendReport(meetingId: number, file: File): Promise<boolean> {
    setActionError(null);
    try {
      await sendReportMutation.mutateAsync({ meetingId, file });
      return true;
    } catch {
      return false;
    }
  }

  return { busy, schedule, reschedule, markStatus, sendReport };
}
