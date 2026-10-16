import { useQuery } from '@tanstack/react-query';
import { apiErrorMessage } from '../lib/axios';
import { fetchApplicantActions } from '../lib/api/actions.api';
import { queryKeys } from '../lib/react-query/queryKeys';

/** Required applicant actions (GET /applicant/actions). Order is the server's. */
export function useApplicantActions() {
  const query = useQuery({ queryKey: queryKeys.requests.actions(), queryFn: fetchApplicantActions });
  return {
    actions: query.data ?? null,
    // A failed background refetch keeps the list.
    error:
      query.error && query.data === undefined
        ? apiErrorMessage(query.error, 'Impossible de charger vos actions.')
        : null,
    /** First load still in flight (no data, no error): callers must not claim "no action". */
    pending: query.isPending && !query.error,
    fetching: query.isFetching,
    retry: () => {
      void query.refetch();
    },
  };
}
