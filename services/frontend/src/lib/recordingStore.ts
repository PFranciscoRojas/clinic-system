// Chunks of an in-progress session recording, held in IndexedDB so a refresh,
// a crash or a closed tab mid-session does not take the audio with it.
//
// One record per chunk, not one array per session. The store used to keep a
// single `Blob[]` under the appointment id, which meant every arriving chunk
// read the whole session back and wrote all of it again: an hour of recording
// cost 1+2+…+n writes, and it got slower exactly as the session got longer —
// the case the recovery feature exists for in the first place.
const DB_NAME = 'sghcp_recordings';
// v1 layout, still read so a recording started before this deploy survives it.
const LEGACY_STORE = 'chunks';
const STORE = 'parts';
const APPOINTMENT_INDEX = 'by_appointment';
const DB_VERSION = 2;

type Part = {
  seq: number;          // autoIncrement — insertion order, and a number so 10 sorts after 2
  appointmentId: string;
  blob: Blob;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Kept, not dropped: a professional recording while the deploy lands has
      // their only copy of the session in here.
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.createObjectStore(LEGACY_STORE);
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex(APPOINTMENT_INDEX, 'appointmentId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const recordingStore = {
  async appendChunk(appointmentId: string, blob: Blob): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      // No key: autoIncrement assigns the next seq, so the write carries this
      // chunk and nothing else, whatever the session has recorded so far.
      tx.objectStore(STORE).add({ appointmentId, blob });
      await done(tx);
    } finally {
      db.close();
    }
  },

  async load(appointmentId: string): Promise<Blob[]> {
    const db = await openDB();
    try {
      const tx = db.transaction([LEGACY_STORE, STORE], 'readonly');
      // Legacy chunks are always older than anything appended since the
      // upgrade, so they lead.
      const legacy = await request<Blob[] | undefined>(
        tx.objectStore(LEGACY_STORE).get(appointmentId) as IDBRequest<Blob[] | undefined>,
      );
      const parts = await request<Part[]>(
        tx.objectStore(STORE).index(APPOINTMENT_INDEX).getAll(appointmentId) as IDBRequest<Part[]>,
      );
      return [...(legacy ?? []), ...parts.map(p => p.blob)];
    } finally {
      db.close();
    }
  },

  async clear(appointmentId: string): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction([LEGACY_STORE, STORE], 'readwrite');
      tx.objectStore(LEGACY_STORE).delete(appointmentId);
      const keys = await request<IDBValidKey[]>(
        tx.objectStore(STORE).index(APPOINTMENT_INDEX).getAllKeys(appointmentId),
      );
      const store = tx.objectStore(STORE);
      for (const key of keys) store.delete(key);
      await done(tx);
    } finally {
      db.close();
    }
  },
};
