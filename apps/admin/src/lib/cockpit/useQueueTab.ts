import { useSearchParams } from 'react-router-dom';

/** `?tab=` with a default; an unknown value falls back to the default. */
export function useQueueTab<K extends string>(allowed: readonly K[], fallback: K): [K, (tab: K) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = allowed.includes(raw as K) ? (raw as K) : fallback;
  function setTab(next: K) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('tab', next);
        out.delete('id');
        return out;
      },
      { replace: true }
    );
  }
  return [tab, setTab];
}
