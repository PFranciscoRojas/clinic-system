const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* Single-flight refresh: the backend ROTATES the refresh token on use, so two
 * concurrent 401s must share one refresh call — a second concurrent attempt
 * would consume an already-rotated token, fail, and log the user out
 * mid-session (mid-clinical-note, in the worst case). */
let refreshing: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

/* Only the auth keys — never localStorage.clear(): the rest of the store holds
 * the clinical-note autosave drafts (the loss-protection net) and per-user
 * onboarding flags, which must survive a session expiry. */
function clearAuthAndRedirect(): never {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  window.location.href = '/login';
  throw new ApiError(401, 'session expired');
}

/* Shared fetch with auth + one refresh-and-retry on 401. Returns the raw
 * Response so JSON and blob consumers handle the body their own way. */
async function authedFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  // FormData bodies must let the browser set the multipart boundary.
  if (init.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    if (retried || !(await tryRefresh())) {
      clearAuthAndRedirect();
    }
    return authedFetch(path, init, true);
  }
  return res;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authedFetch(path, init);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  // Tolerate any success with an empty body (204, or a 201 that returns no
  // JSON, like signup): parsing "" as JSON would throw and surface as a fake
  // failure even though the request succeeded.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function requestBlob(path: string, errorMessage: string): Promise<Blob> {
  const res = await authedFetch(path);
  if (!res.ok) {
    throw new ApiError(res.status, errorMessage);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form, headers: {} }),
  // Binary downloads (PDF, CSV, receipts) — same auth + 401-refresh pipeline
  // as JSON requests; do NOT hand-roll a fetch with the token for these.
  getBlob: (path: string, errorMessage = 'download failed') =>
    requestBlob(path, errorMessage),
};
