import axios from 'axios';
import { MutationCache, QueryClient } from '@tanstack/react-query';

/** K7b - an action refused because the dossier was closed meanwhile (409
 *  DOSSIER_CLOSED): reload the dossier state so the page turns read-only. */
function isDossierClosedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.data?.code === 'DOSSIER_CLOSED';
}

export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isDossierClosedError(error)) {
        void queryClient.invalidateQueries({ queryKey: ['phases', 'dossier-state'] });
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
