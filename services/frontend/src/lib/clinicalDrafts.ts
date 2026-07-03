// Clinical drafts live in localStorage (`clinical-draft*` keys) as the
// always-on safety net while editing. That content is PHI, so an explicit
// logout must not leave it behind on the device: mounted forms flush their
// pending content to the server first (while the access token is still
// valid), then every local draft copy is removed.

const DRAFT_PREFIX = 'clinical-draft';

type Flush = () => Promise<void>;

const flushers = new Set<Flush>();

/** Register a mounted clinical form's server-flush. Returns the unregister fn. */
export function registerDraftFlush(fn: Flush): () => void {
  flushers.add(fn);
  return () => { flushers.delete(fn); };
}

/** Push pending content of every mounted clinical form to the server.
 *  Best-effort: a failing flush never blocks logout. */
export async function flushClinicalDrafts(): Promise<void> {
  await Promise.allSettled([...flushers].map(fn => fn()));
}

/** Remove every local clinical draft copy (and their server-id markers). */
export function clearClinicalDrafts(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
  }
}
