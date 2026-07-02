import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

/** Counts refresh calls; serves 401 to the old token and 200 to the new one. */
function rotatingBackend(opts: { refreshStatus?: number; alwaysUnauthorized?: boolean } = {}): FetchMock {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      if ((opts.refreshStatus ?? 200) !== 200) return jsonRes(opts.refreshStatus!, { error: 'invalid credentials' });
      return jsonRes(200, { access_token: 'new-access', refresh_token: 'new-refresh' });
    }
    if (opts.alwaysUnauthorized || authHeader(init) !== 'Bearer new-access') {
      return jsonRes(401, { error: 'expired' });
    }
    return jsonRes(200, { ok: true });
  });
}

function refreshCalls(fetchMock: FetchMock): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')).length;
}

/* Node ≥22 ships its own experimental `localStorage` global that shadows the
 * DOM environment's and reads as undefined without --localstorage-file. A
 * plain in-memory stub keeps the tests deterministic on any Node version. */
function memoryStorage(): Storage {
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

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  localStorage.setItem('access_token', 'stale-access');
  localStorage.setItem('refresh_token', 'stale-refresh');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('single-flight refresh', () => {
  it('N concurrent 401s share exactly one refresh call', async () => {
    const fetchMock = rotatingBackend();
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      api.get<{ ok: boolean }>('/patients'),
      api.get<{ ok: boolean }>('/appointments'),
      api.get<{ ok: boolean }>('/invoices'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    // The rotated token was consumed once — a second concurrent refresh would
    // have hit the backend with an already-rotated token and logged us out.
    expect(refreshCalls(fetchMock)).toBe(1);
    expect(localStorage.getItem('access_token')).toBe('new-access');
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
  });

  it('a later 401 (after the first refresh settled) refreshes again', async () => {
    const fetchMock = rotatingBackend();
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/patients');
    expect(refreshCalls(fetchMock)).toBe(1);

    localStorage.setItem('access_token', 'stale-again');
    await api.get('/patients');
    expect(refreshCalls(fetchMock)).toBe(2);
  });
});

describe('session expiry', () => {
  it('failed refresh clears ONLY the auth keys and redirects to /login', async () => {
    localStorage.setItem('sghcp_record_draft_abc', 'precious clinical note');
    localStorage.setItem('onboarding_done', '1');
    const fetchMock = rotatingBackend({ refreshStatus: 401 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/patients')).rejects.toThrowError(ApiError);

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    // The loss-protection net and user flags must survive a session expiry.
    expect(localStorage.getItem('sghcp_record_draft_abc')).toBe('precious clinical note');
    expect(localStorage.getItem('onboarding_done')).toBe('1');
    expect(window.location.href).toContain('/login');
  });

  it('retries at most once: refresh OK but still 401 does not loop', async () => {
    const fetchMock = rotatingBackend({ alwaysUnauthorized: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/patients')).rejects.toThrowError(ApiError);

    expect(refreshCalls(fetchMock)).toBe(1);
    const dataCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/patients'));
    expect(dataCalls.length).toBe(2); // original + exactly one retry
  });

  it('missing refresh token short-circuits to logout without calling the API', async () => {
    localStorage.removeItem('refresh_token');
    const fetchMock = rotatingBackend();
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/patients')).rejects.toThrowError(ApiError);
    expect(refreshCalls(fetchMock)).toBe(0);
  });
});

describe('response handling', () => {
  it('propagates the backend error message with its status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(422, { error: 'cita fuera de horario' })));
    localStorage.setItem('access_token', 'whatever');

    const err = await api.post('/appointments', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect((err as ApiError).message).toBe('cita fuera de horario');
  });

  it('tolerates empty success bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api.delete('/consents/1')).resolves.toBeUndefined();
  });

  it('getBlob rejects with the caller message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(500, { error: 'boom' })));
    const err = await api.getBlob('/records/1/export', 'no se pudo exportar el PDF').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('no se pudo exportar el PDF');
  });
});
