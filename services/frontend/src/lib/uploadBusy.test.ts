import { describe, it, expect } from 'vitest';
import { isServerBusy, uploadErrorMessage, SERVER_BUSY_MESSAGE } from './uploadBusy';
import { ApiError } from '@/api/client';

describe('uploadBusy', () => {
  it('recognises the server refusing an upload because it is at capacity', () => {
    expect(isServerBusy(new ApiError(429, 'ocupado'))).toBe(true);
  });

  it('does not mistake a real failure for a busy server', () => {
    // Each of these needs the professional to do something different, and only
    // 429 means "the recording is fine, come back in a minute".
    for (const status of [400, 401, 403, 413, 422, 500, 502]) {
      expect(isServerBusy(new ApiError(status, 'x'))).toBe(false);
    }
    expect(isServerBusy(new Error('network'))).toBe(false);
    expect(isServerBusy(null)).toBe(false);
    expect(isServerBusy({ status: 429 })).toBe(false);
  });

  it('keeps the caller message for anything that is not a busy server', () => {
    const own = 'Error al subir el audio. Verifica el formato (mp3, wav, m4a).';
    expect(uploadErrorMessage(new ApiError(413, 'grande'), own)).toBe(own);
    expect(uploadErrorMessage(new Error('offline'), own)).toBe(own);
  });

  it('replaces it when the server is busy', () => {
    expect(uploadErrorMessage(new ApiError(429, 'ocupado'), 'no se pudo subir'))
      .toBe(SERVER_BUSY_MESSAGE);
  });

  it('never tells the professional the recording is gone', () => {
    // The whole reason this message exists: the chunks stay in IndexedDB until
    // an upload succeeds, and a message that reads like data loss is what makes
    // someone retype an hour of session by hand.
    expect(SERVER_BUSY_MESSAGE).toMatch(/no se perdió/);
    expect(SERVER_BUSY_MESSAGE).not.toMatch(/no se pudo|error|falló/i);
  });
});
