/** K6 - every action that changes the meeting follow-ups refreshes the
 *  analytics overview, so the numbers never lag after an upload. */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { useMeetingActions } from '../phases/preliminary/hooks/useMeetingActions';
import { useFormalMeetingActions } from '../phases/formal/hooks/useFormalMeetingActions';
import { useSiteVisitActions } from '../phases/site-inspection/hooks/useSiteVisitActions';
import { useVerdictAction } from '../phases/site-inspection/hooks/useVerdictAction';

function setup<T>(useHook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
    url === '/uploads' ? { data: { uploadAssetId: 7 } } : { data: {} }
  );
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
  vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(useHook, { wrapper });
  const refreshedAnalytics = () =>
    invalidate.mock.calls.some(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(queryKeys.analytics.all));
  return { result, refreshedAnalytics };
}

const file = new File(['%PDF'], 'cr.pdf', { type: 'application/pdf' });
const noop = () => {};

describe('analytics refresh after meeting actions (K6)', () => {
  it.each([
    ['preliminary: compte-rendu uploaded', () => useMeetingActions(noop, '9'), (h: ReturnType<typeof useMeetingActions>) => h.sendReport(1, file)],
    ['preliminary: meeting marked held', () => useMeetingActions(noop, '9'), (h: ReturnType<typeof useMeetingActions>) => h.markStatus(1, 'held')],
    ['formal: compte-rendu uploaded', () => useFormalMeetingActions('9', noop), (h: ReturnType<typeof useFormalMeetingActions>) => h.sendReport(1, file)],
    ['formal: meeting marked held', () => useFormalMeetingActions('9', noop), (h: ReturnType<typeof useFormalMeetingActions>) => h.markStatus(1, 'held')],
    ['site visit marked held', () => useSiteVisitActions('9', noop), (h: ReturnType<typeof useSiteVisitActions>) => h.markHeld(1)],
    ['R3 opinion submitted', () => useVerdictAction('9', noop), (h: ReturnType<typeof useVerdictAction>) => h.submit(4, 'compliant', 'RAS')],
  ] as Array<[string, () => unknown, (hook: never) => Promise<unknown>]>)('%s', async (_label, useHook, act_) => {
    const { result, refreshedAnalytics } = setup(useHook);
    await act(async () => {
      expect(await act_(result.current as never)).toBe(true);
    });
    expect(refreshedAnalytics()).toBe(true);
  });
});
