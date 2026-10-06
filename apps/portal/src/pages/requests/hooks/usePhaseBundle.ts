import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, type PhaseCode } from '../../../lib/react-query/queryKeys';

/**
 * Loads one phase bundle of a dossier. The API answers 200 with `phase: null`
 * while the phase is not opened yet, so any thrown error is a real failure
 * (network, server, access) and is surfaced to the caller, never swallowed.
 */
export function usePhaseBundle<T extends { phase: unknown }>(
  requestId: number,
  code: PhaseCode,
  fetcher: (requestId: number) => Promise<T>,
  enabled = true,
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.requests.phase(requestId, code),
    queryFn: () => fetcher(requestId),
    enabled,
  });

  /** After any applicant action: refresh every request query (all phases + dossier status). */
  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.requests.all() });
  }

  return {
    bundle: query.data ?? null,
    isLoading: query.isLoading,
    /** True only when nothing can be shown: a failed background refetch keeps the last data. */
    loadFailed: query.isError && query.data === undefined,
    isFetching: query.isFetching,
    retry: () => {
      void query.refetch();
    },
    invalidate,
  };
}
