// Turning the server's ETA into something a professional reads between patients.
//
// The number matters less than its shape. "Listo en unos 8 minutos" and "listo
// en unos 40 minutos" are different decisions: wait, or close the laptop and
// review tomorrow. What must never appear is false precision — the estimate is
// built on a median RTF and a queue that can grow after it is quoted, so it is
// rounded to the granularity it is actually good to.

/** Rounded wait, phrased for the UI. Empty string when there is nothing to say. */
export function formatWait(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 90) return 'menos de un minuto';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    // Coarser as the wait grows: quoting "37 minutos" claims a precision the
    // median behind it does not have, and the reader is deciding between
    // "ahora" and "más tarde" either way.
    const step = minutes < 10 ? 1 : 5;
    const rounded = Math.max(step, Math.round(minutes / step) * step);
    return `unos ${rounded} minutos`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = Math.round((minutes % 60) / 10) * 10;
  if (rest === 0 || rest === 60) {
    const h = rest === 60 ? hours + 1 : hours;
    return h === 1 ? 'una hora' : `unas ${h} horas`;
  }
  return `${hours} h ${rest} min`;
}

/** How much of the wait is other people's recordings. Empty when none. */
export function formatQueue(jobsAhead: number | undefined): string {
  if (!jobsAhead || jobsAhead < 1) return '';
  return jobsAhead === 1
    ? 'Hay otra grabación antes de la tuya.'
    : `Hay ${jobsAhead} grabaciones antes de la tuya.`;
}
