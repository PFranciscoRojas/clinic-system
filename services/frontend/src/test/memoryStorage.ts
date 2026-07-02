/* Node ≥22 ships its own experimental `localStorage` global that shadows the
 * DOM environment's and reads as undefined without --localstorage-file. A
 * plain in-memory stub keeps tests deterministic on any Node version. */
export function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
  };
}
