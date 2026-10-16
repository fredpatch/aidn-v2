import { useEffect } from 'react';

/** Reached from an action link (#anchor): the target may mount after the navigation, so it scrolls itself into view.
 *  An empty anchor (an element without one) does nothing. */
export function useHashScroll(anchor: string): void {
  useEffect(() => {
    if (anchor && window.location.hash === `#${anchor}`) document.getElementById(anchor)?.scrollIntoView?.({ block: 'start' });
  }, [anchor]);
}
