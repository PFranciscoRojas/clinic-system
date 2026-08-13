import { describe, it, expect, vi } from 'vitest';
import { createPartUploader, CHUNKS_PER_PART } from './partUploader';

// Sending the session while it is being recorded instead of all at once at the
// end.
//
// The rule that shapes every test here: the recording in IndexedDB is still the
// copy of record. Nothing this module does may end with a session that cannot be
// uploaded — if the parts path fails for any reason, the caller falls back to
// posting the whole file the way it always did. Losing an hour of a clinical
// session to an optimisation is not a trade that exists.

const chunk = (text: string) => new Blob([text]);

/** A sender that records what it was asked to send. */
function recorder() {
  const sent: { index: number; body: string }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const send = async (index: number, blob: Blob) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const body = await blob.text();
    await Promise.resolve();
    inFlight--;
    sent.push({ index, body });
  };
  return { sent, send, get maxInFlight() { return maxInFlight; } };
}

function fillOnePart(up: ReturnType<typeof createPartUploader>, mark: string) {
  for (let i = 0; i < CHUNKS_PER_PART; i++) up.add(chunk(`${mark}${i}`));
}

describe('partUploader', () => {
  it('sends nothing until there is a whole part worth sending', async () => {
    const r = recorder();
    const up = createPartUploader(r.send);

    for (let i = 0; i < CHUNKS_PER_PART - 1; i++) up.add(chunk('x'));
    await up.idle();

    // One request per five-second chunk would be hundreds of requests an hour
    // for no benefit — the point is that the bytes travel during the session,
    // not that they travel instantly.
    expect(r.sent).toEqual([]);
  });

  it('sends a part as soon as one is complete', async () => {
    const r = recorder();
    const up = createPartUploader(r.send);

    fillOnePart(up, 'a');
    await up.idle();

    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].index).toBe(0);
    expect(r.sent[0].body).toBe(
      Array.from({ length: CHUNKS_PER_PART }, (_, i) => `a${i}`).join(''),
    );
  });

  it('flushes the tail of the recording on finish', async () => {
    const r = recorder();
    const up = createPartUploader(r.send);

    fillOnePart(up, 'a');
    up.add(chunk('tail'));

    await expect(up.finish()).resolves.toBe(true);
    expect(r.sent.map(s => s.index)).toEqual([0, 1]);
    expect(r.sent[1].body).toBe('tail');
  });

  it('numbers parts contiguously from zero', async () => {
    const r = recorder();
    const up = createPartUploader(r.send);

    for (let p = 0; p < 3; p++) fillOnePart(up, `p${p}`);
    await up.finish();

    // The server refuses to assemble an upload with a hole in it, so a gap here
    // does not corrupt a session — it loses one. Same outcome, later.
    expect(r.sent.map(s => s.index)).toEqual([0, 1, 2]);
  });

  it('sends one part at a time', async () => {
    const r = recorder();
    const up = createPartUploader(r.send);

    for (let p = 0; p < 4; p++) fillOnePart(up, `p${p}`);
    await up.finish();

    // A consulting room's uplink is shared with whatever else the clinic is
    // doing. Two of these in flight at once is the recorder competing with
    // itself for the same few hundred kilobits.
    expect(r.maxInFlight).toBe(1);
  });

  it('retries a part that fails and carries on', async () => {
    const r = recorder();
    let attempts = 0;
    const flaky = async (index: number, blob: Blob) => {
      attempts++;
      if (attempts === 1) throw new Error('network');
      await r.send(index, blob);
    };
    const up = createPartUploader(flaky);

    fillOnePart(up, 'a');
    await expect(up.finish()).resolves.toBe(true);
    expect(r.sent.map(s => s.index)).toEqual([0]);
  });

  it('gives up after the retries and reports failure', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const up = createPartUploader(send);

    fillOnePart(up, 'a');
    // false is the whole contract: the caller has to fall back to uploading the
    // recording it still holds in IndexedDB.
    await expect(up.finish()).resolves.toBe(false);
  });

  it('stops sending once it has given up', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const up = createPartUploader(send);

    fillOnePart(up, 'a');
    await up.idle();
    const afterFirstFailure = send.mock.calls.length;

    // The session is still being recorded and the professional has no idea any
    // of this is happening. Retrying every part for the rest of the hour buys
    // nothing and spends the connection they may need for the fallback.
    for (let p = 0; p < 3; p++) fillOnePart(up, `p${p}`);
    await up.idle();

    expect(send.mock.calls.length).toBe(afterFirstFailure);
    await expect(up.finish()).resolves.toBe(false);
  });

  it('reports failure when the recording produced nothing', async () => {
    const r = recorder();
    const up = createPartUploader(r.send);

    // No chunks at all — a microphone that never delivered. There is nothing to
    // complete server-side, and saying so sends the caller down the path that
    // handles an empty recording properly.
    await expect(up.finish()).resolves.toBe(false);
    expect(r.sent).toEqual([]);
  });

  it('never throws out of add, whatever the network is doing', async () => {
    const up = createPartUploader(() => {
      throw new Error('synchronous explosion');
    });

    // add() runs inside MediaRecorder's ondataavailable. An exception escaping
    // it takes the recorder's event handler with it, and the session stops
    // being written to IndexedDB — the copy that the fallback depends on.
    expect(() => fillOnePart(up, 'a')).not.toThrow();
    await expect(up.finish()).resolves.toBe(false);
  });

  it('mints a distinct upload id per recording', () => {
    const a = createPartUploader(async () => {});
    const b = createPartUploader(async () => {});
    expect(a.uploadId).not.toBe(b.uploadId);
    expect(a.uploadId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
