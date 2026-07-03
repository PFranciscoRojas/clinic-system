/** Chapni brand mark — official geometry: a gold half-sun resting on the
 *  horizon, with an echo line at 40%. The horizon inherits `currentColor`
 *  so it adapts to its container. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M17 35 A15 15 0 0 1 47 35 Z" fill="var(--gold-400, #d9a038)" />
      <line x1="11" y1="35" x2="53" y2="35" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="19" y1="44" x2="45" y2="44" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
