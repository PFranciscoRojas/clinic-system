import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/api/client';

type State = 'loading' | 'active' | 'pending' | 'error';

export function BillingReturnPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    let cancelled = false;
    api.post<{ subscription_status: string }>('/billing/reconcile', {})
      .then(data => { if (!cancelled) setState(data.subscription_status === 'active' ? 'active' : 'pending'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, []);

  const msg = {
    loading: { icon: <Loader2 size={48} color="#2a2769" style={{ margin: '0 auto 16px', display: 'block', animation: 'spin 1s linear infinite' }} />, title: 'Confirmando tu suscripción…', body: 'Estamos verificando el pago con MercadoPago.', btn: null },
    active:  { icon: <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px', display: 'block' }} />, title: '¡Suscripción activa!', body: 'Tu consultorio ya está habilitado.', btn: 'Ir a mi consultorio' },
    pending: { icon: <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px', display: 'block' }} />, title: '¡Pago recibido!', body: 'Tu suscripción se activará en unos segundos. Si no se refleja de inmediato, recarga la página en un momento.', btn: 'Ir a mi consultorio' },
    error:   { icon: <AlertCircle size={48} color="#f59e0b" style={{ margin: '0 auto 16px', display: 'block' }} />, title: 'Pago recibido', body: 'MercadoPago procesó el pago. La activación puede tardar unos minutos — recarga el consultorio en un momento.', btn: 'Ir a mi consultorio' },
  }[state];

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(135deg, #2a2769, #171533)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 12px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`@keyframes spin { from { transform:rotate(0deg);} to { transform:rotate(360deg); } }`}</style>
      <div style={{ background: '#fff', borderRadius: 18, padding: '36px 34px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 440, textAlign: 'center' }}>
        {msg.icon}
        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--s800)', marginBottom: 10 }}>{msg.title}</div>
        <div style={{ fontSize: 14, color: 'var(--s500)', lineHeight: 1.7, marginBottom: msg.btn ? 24 : 0 }}>{msg.body}</div>
        {msg.btn && (
          <button onClick={() => navigate('/')} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {msg.btn}
          </button>
        )}
      </div>
    </div>
  );
}
