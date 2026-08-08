import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordingStore } from './recordingStore';

const DB_NAME = 'sghcp_recordings';
const APPT = 'appt-1';
const OTHER = 'appt-2';

function wipeDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(wipeDB);
afterEach(wipeDB);

/** A chunk carrying identifiable content.
 *
 * Node's Blob rather than happy-dom's on purpose: fake-indexeddb clones through
 * the platform's structuredClone, which flattens a happy-dom Blob to `{type}`
 * and loses the bytes — the assertions below would then pass on any
 * implementation. A native Blob round-trips intact, so order and content can be
 * asserted for real. The store never inspects the blob, so which one it is does
 * not matter to the code under test; in the browser these are MediaRecorder's.
 */
function chunk(body: string): Blob {
  return new NodeBlob([body]) as unknown as Blob;
}

const bodies = (blobs: Blob[]): Promise<string[]> =>
  Promise.all(blobs.map(b => b.text()));

/** Counts how many stored items every write actually carries to IndexedDB.
 *
 * This is the whole point of the store's shape. A recorder emitting a chunk
 * every few seconds for an hour writes hundreds of times; if each write carries
 * everything recorded so far, the cost of a session grows with the square of
 * its length — and it does so exactly during a long session, which is the case
 * that matters. Counting items rather than calls keeps the assertion honest for
 * any storage layout: one record per chunk, or one array holding them all.
 */
function countItemsWritten(): { total: () => number; restore: () => void } {
  const proto = IDBObjectStore.prototype;
  const origPut = proto.put;
  const origAdd = proto.add;
  let total = 0;

  const count = (value: unknown): number => (Array.isArray(value) ? value.length : 1);

  proto.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    total += count(value);
    return origPut.call(this, value, key as IDBValidKey);
  } as typeof proto.put;

  proto.add = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    total += count(value);
    return origAdd.call(this, value, key as IDBValidKey);
  } as typeof proto.add;

  return {
    total: () => total,
    restore: () => {
      proto.put = origPut;
      proto.add = origAdd;
    },
  };
}

describe('recordingStore', () => {
  it('returns the chunks of a session in the order they were recorded', async () => {
    for (const body of ['one', 'two', 'three']) {
      await recordingStore.appendChunk(APPT, chunk(body));
    }

    expect(await bodies(await recordingStore.load(APPT))).toEqual(['one', 'two', 'three']);
  });

  it('keeps order past the point where insertion keys stop sorting as strings', async () => {
    const expected = Array.from({ length: 12 }, (_, i) => `chunk-${i}`);
    for (const body of expected) {
      await recordingStore.appendChunk(APPT, chunk(body));
    }

    // A sequence keyed as text would put 10 before 2 and hand the professional
    // a session that jumps around in time.
    expect(await bodies(await recordingStore.load(APPT))).toEqual(expected);
  });

  it('writes each chunk once instead of rewriting the session so far', async () => {
    const spy = countItemsWritten();
    const chunks = 40;
    try {
      for (let i = 0; i < chunks; i++) {
        await recordingStore.appendChunk(APPT, chunk(`chunk-${i}`));
      }
    } finally {
      spy.restore();
    }

    // Rewriting the whole array each time costs 1+2+…+n items written; an hour
    // of session is hundreds of chunks, and that is where it hurts.
    expect(spy.total()).toBe(chunks);
    expect(await recordingStore.load(APPT)).toHaveLength(chunks);
  });

  it('keeps sessions separate — one appointment never sees another', async () => {
    await recordingStore.appendChunk(APPT, chunk('mine'));
    await recordingStore.appendChunk(OTHER, chunk('theirs'));

    expect(await bodies(await recordingStore.load(APPT))).toEqual(['mine']);
    expect(await bodies(await recordingStore.load(OTHER))).toEqual(['theirs']);
  });

  it('clears only the session it was asked to clear', async () => {
    await recordingStore.appendChunk(APPT, chunk('mine'));
    await recordingStore.appendChunk(OTHER, chunk('theirs'));

    await recordingStore.clear(APPT);

    expect(await recordingStore.load(APPT)).toEqual([]);
    expect(await bodies(await recordingStore.load(OTHER))).toEqual(['theirs']);
  });

  it('returns nothing for a session that was never recorded', async () => {
    expect(await recordingStore.load('never-seen')).toEqual([]);
  });
});

describe('recordingStore upgrade from the v1 layout', () => {
  // A professional recording while a deploy lands keeps a v1 database in the
  // browser. Their audio is the only copy of that session — the upgrade must
  // still hand it back, or the recovery banner silently comes up empty.
  function seedV1(appointmentId: string, chunkBodies: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('chunks');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('chunks', 'readwrite');
        tx.objectStore('chunks').put(chunkBodies.map(chunk), appointmentId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }

  it('still recovers a recording written by the previous version', async () => {
    await seedV1(APPT, ['legacy-one', 'legacy-two']);

    expect(await bodies(await recordingStore.load(APPT))).toEqual(['legacy-one', 'legacy-two']);
  });

  it('keeps a recovered legacy recording ahead of chunks appended after the upgrade', async () => {
    await seedV1(APPT, ['legacy-one']);

    await recordingStore.appendChunk(APPT, chunk('after-upgrade'));

    expect(await bodies(await recordingStore.load(APPT))).toEqual(['legacy-one', 'after-upgrade']);
  });

  it('clear removes the legacy recording too', async () => {
    await seedV1(APPT, ['legacy-one']);
    await recordingStore.appendChunk(APPT, chunk('after-upgrade'));

    await recordingStore.clear(APPT);

    expect(await recordingStore.load(APPT)).toEqual([]);
  });
});
