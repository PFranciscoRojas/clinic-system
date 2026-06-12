import { useState, useEffect } from 'react';

// Single source of truth for responsive breakpoints. The app is built with
// inline styles, so components branch on these hooks instead of media queries.
export const MOBILE_MAX = 767;   // phones
export const TABLET_MAX = 1023;  // tablets / narrow laptops

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX}px)`);
}

/** Mobile OR tablet — anything below desktop width. */
export function useIsCompact(): boolean {
  return useMediaQuery(`(max-width: ${TABLET_MAX}px)`);
}
