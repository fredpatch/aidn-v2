import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  attachMeetingReport,
  markMeetingStatus,
  rescheduleMeeting,
  scheduleMeeting,
  uploadFile,
} from '../api';
import { apiErrorMessage } from '../../../../lib/axios';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useMeetingActions(
  setActionError: (message: string | null) => void,
  requestId: string | undefined
) {
  const queryClient = useQueryClient();

  const scheduleMutation = useMutation({
    mutationFn: scheduleMeeting,
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de planifier la reunion.')),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ meetingId, dateTime }: { meetingId: number; dateTime: string }) =>
      rescheduleMeeting(meetingId, new Date(dateTime).toISOString()),
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
      }
    },
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
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, 'Action impossible.')),
  });

  const sendReportMutation = useMutation({
    mutationFn: async ({ meetingId, file }: { meetingId: number; file: File }) => {
      const uploaded = await uploadFile(file);
      await attachMeetingReport(meetingId, uploaded.fileUrl, uploaded.mimeType);
    },
    onSuccess: async () => {
      if (requestId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.preliminary.bundle(requestId) });
      }
    },
    onError: (err) => setActionError(apiErrorMessage(err, "Impossible d'envoyer le compte-rendu.")),
  });

  async function schedule(params: {
    phaseId: number;
    dnAgentId: number;
    dateTime: string;
    location?: string;
  }): Promise<{ softOverlapWarning: boolean } | undefined> {
    setActionError(null);
    try {
      const result = await scheduleMutation.mutateAsync({
        phaseId: params.phaseId,
        dnAgentId: params.dnAgentId,
        scheduledAtIso: new Date(params.dateTime).toISOString(),
        location: params.location,
      });
      return result;
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

  const busy =
    scheduleMutation.isPending ||
    rescheduleMutation.isPending ||
    markStatusMutation.isPending ||
    sendReportMutation.isPending;

  return {
    busy,
    schedule,
    reschedule,
    markStatus,
    sendReport,
  };
}
