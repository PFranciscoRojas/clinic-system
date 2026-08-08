import { describe, expect, it } from 'vitest';

import {
  AUDIO_BITS_PER_SECOND,
  AUDIO_CONSTRAINTS,
  CHUNK_MS,
  estimatedBytesPerHour,
} from './recording';

const MB = 1024 * 1024;
/** core-api's maxAudioSize (aidrafts/handler/writer.go). */
const SERVER_CAP_BYTES = 200 * MB;

describe('session recording settings', () => {
  it('keeps a long session comfortably inside the server upload cap', () => {
    // Sessions run over: a 90-minute first appointment is ordinary, and the
    // upload has to succeed, not fail at the last minute with the session gone.
    const threeHours = estimatedBytesPerHour() * 3;

    expect(threeHours).toBeLessThan(SERVER_CAP_BYTES / 2);
  });

  it('uploads an hour in seconds, not minutes, on a slow clinic uplink', () => {
    // 500 KB/s is what the VPS measured against a real consulting room.
    const secondsToUpload = estimatedBytesPerHour() / (500 * 1024);

    expect(secondsToUpload).toBeLessThan(30);
  });

  it('stays well above the point where speech recognition starts to suffer', () => {
    // Opus for voice degrades below roughly 16 kbps, and the transcript is the
    // product — shrinking the file past that trades the wrong thing.
    expect(AUDIO_BITS_PER_SECOND).toBeGreaterThanOrEqual(16_000);
  });

  it('asks the device for what Whisper actually consumes', () => {
    expect(AUDIO_CONSTRAINTS.channelCount).toBe(1);
    expect(AUDIO_CONSTRAINTS.sampleRate).toBe(16_000);
  });

  it('does not write to IndexedDB more often than recovery needs', () => {
    const writesPerHour = 3600 / (CHUNK_MS / 1000);

    expect(writesPerHour).toBeLessThanOrEqual(1000);
  });
});
