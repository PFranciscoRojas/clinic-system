// Sending the session to the server while it is still being recorded.
//
// MediaRecorder hands over a chunk every CHUNK_MS and those chunks used to sit
// in IndexedDB until "Finalizar sesión", at which point an hour of audio started
// crossing a clinic uplink with the professional watching a progress bar. The
// bytes can travel during the hour they are already sitting there.
//
// The rule that shapes everything below: **the recording in IndexedDB is still
// the copy of record.** Nothing here may end with a session that cannot be
// uploaded. When any part fails past its retries this reports failure and stops,
// and the caller posts the whole file the way it always did. Losing an hour of a
// clinical session to a latency optimisation is not a trade that exists.

/** Chunks batched into one part. At CHUNK_MS = 5 s this is a minute of session.
 *
 * One request per chunk would be hundreds of requests an hour for no benefit:
 * the point is that the bytes travel during the session, not that they travel
 * the instant they exist. A minute is also small enough that a part fits in the
 * server's ordinary 15 s timeouts, which is why the parts route needs none of
 * the single-shot route's bespoke deadline handling. */
export const CHUNKS_PER_PART = 12;

/** Attempts per part, the first one included. */
export const PART_ATTEMPTS = 3;

export type PartSender = (index: number, blob: Blob) => Promise<void>;

export interface PartUploader {
  /** Names this upload server-side; every part carries it. */
  readonly uploadId: string;
  /** Feed one MediaRecorder chunk. Never throws, never blocks. */
  add(chunk: Blob): void;
  /** Resolves when everything queued so far has been dealt with. */
  idle(): Promise<void>;
  /** Flush the tail and report whether the whole session is on the server.
   *  `false` means the caller must fall back to the whole-body upload. */
  finish(): Promise<boolean>;
}

function newUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older Safari. The id only has to be unique within an appointment's folder,
  // and the server validates the shape either way.
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

export function createPartUploader(send: PartSender): PartUploader {
  const uploadId = newUploadId();
  let pending: Blob[] = [];
  let nextIndex = 0;
  let sentAny = false;
  let brokenPromise = false;

  // Parts are sent one at a time. They are independent files server-side so
  // ordering is not required for correctness — but a consulting room's uplink is
  // shared with whatever else the clinic is doing, and two of these at once is
  // the recorder competing with itself for the same few hundred kilobits.
  let chain: Promise<void> = Promise.resolve();

  const enqueue = (index: number, body: Blob) => {
    chain = chain.then(async () => {
      if (brokenPromise) return;
      for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
        try {
          await send(index, body);
          sentAny = true;
          return;
        } catch {
          // Once the retries are spent, stop for the rest of the session. The
          // professional has no idea any of this is happening; retrying every
          // part for the remaining forty minutes buys nothing and spends the
          // connection the fallback is going to need.
          if (attempt === PART_ATTEMPTS) brokenPromise = true;
        }
      }
    });
  };

  const cut = () => {
    if (pending.length === 0) return;
    const body = new Blob(pending);
    pending = [];
    enqueue(nextIndex++, body);
  };

  return {
    uploadId,
    add(c: Blob) {
      if (brokenPromise) return;
      // This runs inside MediaRecorder's ondataavailable. An exception escaping
      // it takes the recorder's handler down, and with it the writes to
      // IndexedDB — the copy the fallback depends on.
      try {
        pending.push(c);
        if (pending.length >= CHUNKS_PER_PART) cut();
      } catch {
        brokenPromise = true;
      }
    },
    idle: () => chain,
    async finish() {
      cut();
      await chain;
      // sentAny guards the empty recording: a microphone that never delivered a
      // chunk has nothing for the server to assemble, and saying so sends the
      // caller down the path that handles that properly.
      return sentAny && !brokenPromise;
    },
  };
}
