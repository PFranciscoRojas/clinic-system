import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { authApi } from '@/api/auth';

type PageState = 'form' | 'saving' | 'done' | 'error';

// Public landing reached from the password-reset email (/reset-password?token=…).
// No auth: the single-use token in the URL is the credential.
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<PageState>(token ? 'form' : 'error');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(token ? '' : 'El enlace no es válido. Solicita uno nuevo desde la pantalla de inicio de sesión.');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pwd.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (pwd !== pwd2)    { setErr('Las contraseñas no coinciden.'); return; }
    setState('saving');
    try {
      await authApi.confirmReset(token, pwd);
      setState('done');
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'No se pudo restablecer la contraseña.';
      setErr(/inválid|expir/i.test(msg) ? 'El enlace es inválido o expiró. Solicita uno nuevo.' : msg);
      setState('error');
    }
  };

  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: '32px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', width: '100%', maxWidth: 420, boxSizing: 'border-box' };
  const inputWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--s200)', borderRadius: 11, padding: '11px 14px', marginBottom: 12, background: '#fff' };
  const input: React.CSSProperties = { border: 'none', outline: 'none', flex: 1, fontSize: 14, color: 'var(--s800)', background: 'transparent' };

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(135deg, #2a2769, #171533)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 12px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', border: '1.5px solid rgba(255,255,255,0.20)' }}>
            <Lock size={26} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#fff' }}>Nueva contraseña</div>
        </div>

        <div style={card}>
          {state === 'done' ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle2 size={44} color="#10b981" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--s800)', marginBottom: 10 }}>¡Contraseña actualizada!</div>
              <div style={{ fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 24 }}>
                Ya puedes iniciar sesión con tu nueva contraseña.
              </div>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Ir al inicio de sesión
              </button>
            </div>
          ) : state === 'error' && !token ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <AlertTriangle size={44} color="#f59e0b" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontSize: 13.5, color: 'var(--s600)', lineHeight: 1.7, marginBottom: 24 }}>{err}</div>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Ir al inicio de sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ fontSize: 13, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 18 }}>
                Elige una contraseña nueva de al menos 8 caracteres.
              </div>
              <div style={inputWrap}>
                <Lock size={16} color="var(--s400)" />
                <input type={show ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)}
                  placeholder="Nueva contraseña" autoComplete="new-password" style={input} />
                <button type="button" onClick={() => setShow(s => !s)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex' }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={inputWrap}>
                <Lock size={16} color="var(--s400)" />
                <input type={show ? 'text' : 'password'} value={pwd2} onChange={e => setPwd2(e.target.value)}
                  placeholder="Repite la contraseña" autoComplete="new-password" style={input} />
              </div>
              {err && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 9, padding: '9px 12px', marginBottom: 14 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />{err}
                </div>
              )}
              <button type="submit" disabled={state === 'saving'} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', background: state === 'saving' ? 'var(--s300)' : 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: state === 'saving' ? 'wait' : 'pointer' }}>
                {state === 'saving' ? 'Guardando…' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
