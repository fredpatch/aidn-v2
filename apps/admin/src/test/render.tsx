import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/** Render inside the same providers as the app, with a fresh query cache.
 *  `seed` pre-fills the cache so tests never hit the network. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', seed = [] as Array<[readonly unknown[], unknown]> } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, retryOnMount: false } },
  });
  for (const [key, data] of seed) queryClient.setQueryData(key, data);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
