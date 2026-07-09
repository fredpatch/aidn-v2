import { useCallback, useState } from 'react';

export function useAsyncAction() {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } catch {
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
