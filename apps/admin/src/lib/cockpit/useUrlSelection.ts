import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** `?id=` selection; never shows an item that is not visible: falls back to
 *  the first visible row, or to none. Once the list is `ready` (loaded), a
 *  stale `?id=` (the row left the tab after a mutation) is replaced by the
 *  fallback id, or removed when no row remains. Never while loading, so a
 *  deep link survives the first fetch. */
export function useUrlSelection<T extends { id: string }>(visible: T[], ready = true) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('id');
  const selected = visible.find((item) => item.id === requested) ?? visible[0] ?? null;
  const fallbackId = selected?.id ?? null;
  useEffect(() => {
    if (!ready || requested === null || requested === fallbackId) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (fallbackId === null) next.delete('id');
        else next.set('id', fallbackId);
        return next;
      },
      { replace: true }
    );
  }, [ready, requested, fallbackId, setParams]);
  function select(item: T) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('id', item.id);
        return next;
      },
      { replace: true }
    );
  }
  return { selected, select };
}
