import { useMutation } from '@tanstack/react-query';
import { apiErrorMessage } from '../../lib/axios';
import {
  acceptMeetingAlternate,
  confirmMeetingOnBehalf,
  refuseMeetingAlternate,
} from '../../lib/api/meetings.api';

/** SESSION1-MEET-1 - the DN side of a meeting negotiation, shared by the
 *  Réunions page and the M3 / M4 workspaces (one implementation of each
 *  action). `onChanged` refreshes whatever the caller displays. */
export function useMeetingNegotiationActions(
  setActionError: (message: string | null) => void,
  onChanged: () => unknown
) {
  const acceptMutation = useMutation({
    mutationFn: acceptMeetingAlternate,
    onSuccess: onChanged,
    onError: (err) => setActionError(apiErrorMessage(err, "Impossible d'accepter cette date.")),
  });
  const refuseMutation = useMutation({
    mutationFn: ({ meetingId, reason }: { meetingId: number; reason: string }) =>
      refuseMeetingAlternate(meetingId, reason),
    onSuccess: onChanged,
    onError: (err) => setActionError(apiErrorMessage(err, 'Impossible de refuser cette date.')),
  });
  const onBehalfMutation = useMutation({
    mutationFn: ({ meetingId, note }: { meetingId: number; note: string }) => confirmMeetingOnBehalf(meetingId, note),
    onSuccess: onChanged,
    onError: (err) => setActionError(apiErrorMessage(err, "Impossible d'enregistrer la confirmation.")),
  });

  async function accept(meetingId: number): Promise<{ softOverlapWarning: boolean } | undefined> {
    setActionError(null);
    try {
      return await acceptMutation.mutateAsync(meetingId);
    } catch {
      return undefined;
    }
  }

  async function refuse(meetingId: number, reason: string): Promise<boolean> {
    setActionError(null);
    try {
      await refuseMutation.mutateAsync({ meetingId, reason });
      return true;
    } catch {
      return false;
    }
  }

  async function confirmOnBehalf(meetingId: number, note: string): Promise<boolean> {
    setActionError(null);
    try {
      await onBehalfMutation.mutateAsync({ meetingId, note });
      return true;
    } catch {
      return false;
    }
  }

  return {
    busy: acceptMutation.isPending || refuseMutation.isPending || onBehalfMutation.isPending,
    accept,
    refuse,
    confirmOnBehalf,
  };
}
