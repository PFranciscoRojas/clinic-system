// How the session recorder captures audio.
//
// The one fact that drives all of it: Whisper resamples everything to 16 kHz
// mono before it looks at it. Every bit above that is uploaded over a clinic
// connection, written to disk as PHI, and then discarded by the first thing
// that reads it. The recorder used to take the browser's default (~140 kbps,
// measured at 61 MB for a 58-minute session), so roughly six sevenths of what
// a professional waited to upload was never going to be transcribed.

/** Opus at 24 kbps mono is transparent for speech recognition. */
export const AUDIO_BITS_PER_SECOND = 24_000;

/** Hints to the capture device.
 *
 * `sampleRate` and `channelCount` are advisory — browsers may ignore them, and
 * the bitrate above is what actually bounds the file either way. Echo
 * cancellation and noise suppression are here for accuracy rather than size:
 * a consulting room has a second voice, a fan and a street outside it.
 */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  sampleRate: 16_000,
  echoCancellation: true,
  noiseSuppression: true,
};

/** How often MediaRecorder hands over a chunk.
 *
 * Every chunk is a write to IndexedDB. At one second an hour of session is
 * 3.600 of them for no benefit: the finer granularity buys nothing, since
 * recovery works the same whether the last few seconds are lost or not.
 */
export const CHUNK_MS = 5_000;

/** Bytes an hour of recording is expected to occupy at a given bitrate. */
export function estimatedBytesPerHour(bitsPerSecond = AUDIO_BITS_PER_SECOND): number {
  return (bitsPerSecond / 8) * 3600;
}
