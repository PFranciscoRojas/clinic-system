import { ApiError } from '@/api/client';

// A 429 from the audio routes is not a failure, and telling the professional it
// was one is the actual damage. The server bounds how many recordings it holds
// in memory at once, so several sessions closing in the same minute means one of
// them is asked to come back. Their recording is intact either way: the chunks
// stay in IndexedDB until an upload succeeds.
//
// "No se pudo subir" reads as "something broke, and it will probably break
// again" — the note gets abandoned or retyped by hand. "Espera un minuto" reads
// as what it is.

export const SERVER_BUSY_MESSAGE =
  'El servidor está recibiendo otras grabaciones en este momento. La tuya no se perdió: espera un minuto y reintenta.';

export function isServerBusy(e: unknown): boolean {
  return e instanceof ApiError && e.status === 429;
}

/** The busy message when the server said 429, the caller's own otherwise. */
export function uploadErrorMessage(e: unknown, fallback: string): string {
  return isServerBusy(e) ? SERVER_BUSY_MESSAGE : fallback;
}
