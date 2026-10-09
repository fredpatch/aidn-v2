import axios from 'axios';
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

/** K7b - an action refused because the dossier was closed meanwhile (409
 *  DOSSIER_CLOSED): reload the dossier state so the page turns read-only.
 *  K7c - and the staff work lists, so the row shows the dossier as closed. */
export function isDossierClosedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.data?.code === 'DOSSIER_CLOSED';
}

const DOSSIER_WORK_LISTS = [
  queryKeys.deepEvaluation.paymentQueue(),
  queryKeys.siteInspection.paymentQueue(),
  queryKeys.certificates.paymentQueue(),
  queryKeys.siteInspection.myQueue(),
  queryKeys.meetings.all,
];

export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isDossierClosedError(error)) {
        void queryClient.invalidateQueries({ queryKey: ['phases', 'dossier-state'] });
        for (const queryKey of DOSSIER_WORK_LISTS) void queryClient.invalidateQueries({ queryKey });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
