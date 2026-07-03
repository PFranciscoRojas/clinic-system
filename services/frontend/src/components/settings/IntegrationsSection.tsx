import React, { useState } from 'react';
import { AlertCircle, Lock, Key, CheckCircle } from 'lucide-react';
import { authApi } from '@/api/auth';
import { OnlinePaymentCard } from './BillingSection';
import { WhatsAppCard } from './WhatsAppCard';

export function IntegrationsSection() {
  const [unlocked, setUnlocked] = useState(false);
  const [pwd,      setPwd]      = useState('');
  const [pwdErr,   setPwdErr]   = useState('');
  const [verifying,setVerifying]= useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd.trim()) return;
    setVerifying(true); setPwdErr('');
    try {
      await authApi.verifyPassword(pwd.trim());
      setUnlocked(true);
      setPwd('');
    } catch {
      setPwdErr('Contraseña incorrecta. Verifica e intenta de nuevo.');
    } finally {
      setVerifying(false);
    }
  };

  if (!unlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', maxWidth: 420 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f3f2fb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Lock size={26} color="#5b52ad" />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--s800)', textAlign: 'center' }}>
          Área protegida
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13.5, color: 'var(--s500)', textAlign: 'center', lineHeight: 1.6 }}>
          Aquí se configuran las credenciales de servicios externos (MercadoPago, WhatsApp).
          Un cambio accidental puede interrumpir los pagos en línea o los recordatorios.
          Confirma tu contraseña para continuar.
        </p>
        <form onSubmit={handleUnlock} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={pwd}
            onChange={e => { setPwd(e.target.value); setPwdErr(''); }}
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Tu contraseña"
            style={{
              padding: '10px 14px', borderRadius: 10,
              border: `1.5px solid ${pwdErr ? '#ef4444' : 'var(--s200)'}`,
              fontSize: 14, color: 'var(--s800)', outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          {pwdErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#ef4444' }}>
              <AlertCircle size={13} />{pwdErr}
            </div>
          )}
          <button
            type="submit"
            disabled={verifying || !pwd.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: verifying || !pwd.trim() ? 'var(--s200)' : '#5b52ad',
              color: verifying || !pwd.trim() ? 'var(--s400)' : '#fff',
              fontSize: 14, fontWeight: 700, cursor: verifying || !pwd.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {verifying
              ? <><span style={{ width: 14, height: 14, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Verificando…</>
              : <><Key size={15} />Desbloquear</>}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: '#f3f2fb', border: '1px solid #cbc7ee', borderRadius: 10, fontSize: 12.5, color: '#363285' }}>
        <CheckCircle size={13} color="#5b52ad" />
        <span>Sesión desbloqueada — puedes editar las credenciales de integración.</span>
        <button
          onClick={() => setUnlocked(false)}
          style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#5b52ad', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          Bloquear
        </button>
      </div>

      <OnlinePaymentCard />
      <WhatsAppCard setDirty={() => {}} />
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

