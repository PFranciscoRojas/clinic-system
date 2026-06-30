// Tracks a pending service-worker update so the UI can defer the reload
// instead of forcing it mid-edit. A reload while the professional is writing
// a clinical note silently wipes anything not yet flushed to localStorage —
// see services/frontend/src/main.tsx for the controllerchange listener that
// used to call window.location.reload() unconditionally.
type Listener = () => void;

let pending = false;
const listeners = new Set<Listener>();

export function markUpdatePending() {
  pending = true;
  listeners.forEach(l => l());
}

export function hasPendingUpdate() {
  return pending;
}

export function onSwUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reloadNow() {
  window.location.reload();
}
