import { useCallback, useSyncExternalStore } from 'react';

// Single source of truth for responsive breakpoints. The app is built with
// inline styles, so components branch on these hooks instead of media queries.
export const MOBILE_MAX = 767;   // phones
export const TABLET_MAX = 1023;  // tablets / narrow laptops
export const COMPACT_MAX = 900;  // compact breakpoint: center column collapses

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX}px)`);
}

/** Mobile OR compact tablet — triggers sidebar collapse at 900px. */
export function useIsCompact(): boolean {
  return useMediaQuery(`(max-width: ${COMPACT_MAX}px)`);
}
