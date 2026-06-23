const DB_NAME = 'sghcp_recordings';
const STORE = 'chunks';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export const recordingStore = {
  async appendChunk(appointmentId: string, blob: Blob): Promise<void> {
    const db = await openDB();
    const existing: Blob[] = await new Promise((res, rej) => {
      const req = tx(db, 'readonly').get(appointmentId);
      req.onsuccess = () => res(req.result ?? []);
      req.onerror = () => rej(req.error);
    });
    await new Promise<void>((res, rej) => {
      const req = tx(db, 'readwrite').put([...existing, blob], appointmentId);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
    db.close();
  },

  async load(appointmentId: string): Promise<Blob[]> {
    const db = await openDB();
    const result: Blob[] = await new Promise((res, rej) => {
      const req = tx(db, 'readonly').get(appointmentId);
      req.onsuccess = () => res(req.result ?? []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  },

  async clear(appointmentId: string): Promise<void> {
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const req = tx(db, 'readwrite').delete(appointmentId);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
    db.close();
  },
};
