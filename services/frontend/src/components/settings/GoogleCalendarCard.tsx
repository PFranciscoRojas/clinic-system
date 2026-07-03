import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { gcalApi } from '@/api/gcal';
import { SectionCard } from './primitives';

export function GoogleCalendarCard() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    gcalApi.status().then(s => {
      setConnected(s.connected);
      setEmail(s.google_email ?? '');
    }).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const result = params.get('google');
    if (result === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
      // Auto-sync existing appointments right after connecting
      setSyncing(true);
      gcalApi.sync()
        .then(r => {
          setMsg(r.queued > 0
            ? `Conectado. Sincronizando ${r.queued} cita${r.queued !== 1 ? 's' : ''} en Google Calendar…`
            : 'Google Calendar conectado correctamente.');
        })
        .catch(() => setMsg('Google Calendar conectado.'))
        .finally(() => setSyncing(false));
    } else if (result === 'error') {
      setMsg('No se pudo conectar con Google. Intenta de nuevo.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    try {
      const { auth_url } = await gcalApi.connectURL();
      window.location.href = auth_url;
    } catch {
      setMsg('No se pudo obtener la URL de autorización.');
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await gcalApi.disconnect();
      setConnected(false);
      setEmail('');
      setMsg('Google Calendar desconectado y eventos eliminados.');
    } catch {
      setMsg('Error al desconectar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Google Calendar" icon={Calendar} color="#4285f4">
      <div style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msg && (
          <p style={{ margin: 0, fontSize: 13, color: msg.includes('Error') || msg.includes('pudo') ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
            {msg}
          </p>
        )}
        {connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
              {syncing ? '⏳ Sincronizando citas…' : `✓ Conectado como `}
              {!syncing && <strong>{email || 'cuenta Google'}</strong>}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleDisconnect}
                disabled={busy || syncing}
                style={{ padding: '7px 14px', background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 8, cursor: (busy || syncing) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {busy ? 'Desconectando…' : 'Desconectar'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--s500)', lineHeight: 1.5 }}>
              Sincroniza tus citas automáticamente con tu Google Calendar personal.
            </p>
            <button
              onClick={handleConnect}
              disabled={busy}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#4285f4', color: '#fff', border: 'none', borderRadius: 9, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: busy ? 0.7 : 1 }}
            >
              <Calendar size={15} />
              {busy ? 'Redirigiendo…' : 'Conectar Google Calendar'}
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Schedule section ──────────────────────────────────────────────────────────

