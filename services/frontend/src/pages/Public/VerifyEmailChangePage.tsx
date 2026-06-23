import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MailCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { authApi } from '@/api/auth';

type PageState = 'verifying' | 'done' | 'error';

export function VerifyEmailChangePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<PageState>(token ? 'verifying' : 'error');
  const [err, setErr] = useState(token ? '' : 'El enlace no es válido. Solicita el cambio de correo de nuevo.');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await authApi.verifyEmailChange(token);
        setState('done');
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : '';
        setErr(/inválid|expir/i.test(msg) ? 'El enlace es inválido o expiró.' : 'No se pudo confirmar el cambio de correo.');
        setState('error');
      }
    })();
  }, [token]);

  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: '32px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', width: '100%', maxWidth: 420, boxSizing: 'border-box', textAlign: 'center' };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f766e, #134e4a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', border: '1.5px solid rgba(255,255,255,0.20)' }}>
            <MailCheck size={26} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#fff' }}>Cambio de correo</div>
        </div>

        <div style={card}>
          {state === 'verifying' && (
            <div style={{ padding: '12px 0' }}>
              <span style={{ width: 30, height: 30, border: '3px solid var(--s200)', borderTopColor: 'var(--teal)', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block', marginBottom: 16 }} />
              <div style={{ fontSize: 14, color: 'var(--s500)' }}>Confirmando tu nuevo correo…</div>
            </div>
          )}

          {state === 'done' && (
            <div style={{ padding: '8px 0' }}>
              <CheckCircle2 size={44} color="#10b981" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--s800)', marginBottom: 10 }}>¡Correo actualizado!</div>
              <div style={{ fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 24 }}>
                Tu nueva dirección está activa. Inicia sesión con ella para continuar.
              </div>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Iniciar sesión
              </button>
            </div>
          )}

          {state === 'error' && (
            <div style={{ padding: '8px 0' }}>
              <AlertTriangle size={44} color="#f59e0b" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontSize: 13.5, color: 'var(--s600)', lineHeight: 1.7, marginBottom: 24 }}>{err}</div>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Ir al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
