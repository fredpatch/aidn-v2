/** SESSION1-MEET-2 - a 409 MEETING_REPORT_FROZEN_SIGNED means the applicant
 *  returned a signed copy meanwhile: the DN card must show the API message AND
 *  refresh the bundle so the received copy appears. */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { useMeetingActions } from './preliminary/hooks/useMeetingActions';
import { useFormalMeetingActions } from './formal/hooks/useFormalMeetingActions';

const FROZEN =
  'Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant.';
const file = new File(['%PDF'], 'cr.pdf', { type: 'application/pdf' });

function setup<T>(useHook: (setError: (m: string | null) => void) => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
    if (url === '/uploads') return { data: { uploadAssetId: 7 } };
    throw { isAxiosError: true, response: { status: 409, data: { message: FROZEN } } };
  });
  const setError = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useHook(setError), { wrapper });
  const invalidated = (key: readonly unknown[]) =>
    invalidate.mock.calls.some(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(key));
  return { result, setError, invalidated };
}

describe('report upload rejected with 409 (frozen by signed copy)', () => {
  it('preliminary: shows the message and refreshes the bundle', async () => {
    const { result, setError, invalidated } = setup((s) => useMeetingActions(s, '9'));
    await act(async () => {
      expect(await result.current.sendReport(1, file)).toBe(false);
    });
    expect(setError).toHaveBeenLastCalledWith(FROZEN);
    expect(invalidated(queryKeys.preliminary.bundle('9'))).toBe(true);
  });

  it('formal: shows the message and refreshes the bundle', async () => {
    const { result, setError, invalidated } = setup((s) => useFormalMeetingActions('9', s));
    await act(async () => {
      expect(await result.current.sendReport(1, file)).toBe(false);
    });
    expect(setError).toHaveBeenLastCalledWith(FROZEN);
    expect(invalidated(queryKeys.formal.bundle('9'))).toBe(true);
  });
});
