import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../../../lib/axios';
import { fetchUsersByRole, markSiteVisitHeld, scheduleSiteVisit } from '../api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export function useR3Agents() {
  const query = useQuery({
    queryKey: queryKeys.siteInspection.usersByRole('r3_agent'),
    queryFn: () => fetchUsersByRole('r3_agent'),
  });
  return { agents: query.data ?? [], loading: query.isLoading };
}

export function useSiteVisitActions(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const queryClient = useQueryClient();

  function invalidate() {
    if (requestId) {
      return queryClient.invalidateQueries({
        queryKey: queryKeys.siteInspection.bundle(requestId),
      });
    }
  }

  const scheduleMutation = useMutation({
    mutationFn: (params: {
      phaseId: number;
      r3AgentId: number;
      scheduledAt: string;
      location?: string;
    }) => scheduleSiteVisit(params),
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de planifier la visite sur site.')),
  });

  const markHeldMutation = useMutation({
    mutationFn: (meetingId: number) => markSiteVisitHeld(meetingId),
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(apiErrorMessage(err, 'Impossible de marquer la visite comme tenue.')),
  });

  async function schedule(params: {
    phaseId: number;
    r3AgentId: number;
    scheduledAt: string;
    location?: string;
  }): Promise<boolean> {
    setActionError(null);
    try {
      const result = await scheduleMutation.mutateAsync(params);
      if (result.softOverlapWarning) {
        setActionError(
          "Attention : cet agent R3 a déjà une visite ce jour-là (chevauchement non bloquant)."
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  async function markHeld(meetingId: number): Promise<boolean> {
    setActionError(null);
    try {
      await markHeldMutation.mutateAsync(meetingId);
      return true;
    } catch {
      return false;
    }
  }

  return {
    busy: scheduleMutation.isPending || markHeldMutation.isPending,
    schedule,
    markHeld,
  };
}
