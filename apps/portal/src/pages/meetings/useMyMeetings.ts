import { useQuery } from '@tanstack/react-query';
import { apiErrorMessage } from '../../lib/axios';
import { fetchMyMeetings } from '../../lib/api/meetings.api';
import { queryKeys } from '../../lib/react-query/queryKeys';

/** The applicant's meetings across all dossiers (GET /meetings/mine). */
export function useMyMeetings() {
  const query = useQuery({ queryKey: queryKeys.meetings.mine(), queryFn: fetchMyMeetings });
  return {
    meetings: query.data ?? null,
    // Same rule as the other portal queries: a failed background refetch keeps the list.
    error:
      query.error && query.data === undefined
        ? apiErrorMessage(query.error, 'Impossible de charger vos réunions.')
        : null,
    fetching: query.isFetching,
    retry: () => {
      void query.refetch();
    },
  };
}
