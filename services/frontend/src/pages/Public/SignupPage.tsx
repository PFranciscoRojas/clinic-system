import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, Mail, Lock, Eye, EyeOff, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/client';

type PageState = 'form' | 'saving' | 'done';

// Public self-serve org creation (/signup). Creates a NEW organization (the
// clinic) plus its owner/admin, and sends a verification email. The account
// can't log in until the address is confirmed, so on success we show a
// "check your inbox" screen rather than logging in. Additional staff join an
// existing org later via invite codes — this page is only for new clinics.
export function SignupPage() {
  const navigate = useNavigate();

  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [state, setState] = useState<PageState>('form');
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!orgName.trim())                 { setErr('Ingresa el nombre del consultorio.'); return; }
    if (!name.trim())                    { setErr('Ingresa tu nombre completo.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('Ingresa un correo válido.'); return; }
    if (pwd.length < 8)                  { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    setState('saving');
    try {
      await authApi.signup(orgName.trim(), name.trim(), email.trim(), pwd);
      setState('done');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr('Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.');
      } else if (e instanceof ApiError && e.message) {
        setErr(e.message);
      } else {
        setErr('No se pudo crear la cuenta. Inténtalo de nuevo.');
      }
      setState('form');
    }
  };

  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: '32px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', width: '100%', maxWidth: 430, boxSizing: 'border-box' };
  const inputWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--s200)', borderRadius: 11, padding: '11px 14px', marginBottom: 12, background: '#fff' };
  const input: React.CSSProperties = { border: 'none', outline: 'none', flex: 1, fontSize: 14, color: 'var(--s800)', background: 'transparent' };
  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--s500)', letterSpacing: '.06em', textTransform: 'uppercase', margin: '4px 2px 10px' };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f766e, #134e4a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 430 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', border: '1.5px solid rgba(255,255,255,0.20)' }}>
            <Building2 size={26} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#fff' }}>Registra tu consultorio</div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>Crea tu organización en SGHCP · 14 días de prueba, sin tarjeta</div>
        </div>

        <div style={card}>
          {state === 'done' ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle2 size={44} color="#10b981" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--s800)', marginBottom: 10 }}>Revisa tu correo</div>
              <div style={{ fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 24 }}>
                Te enviamos un enlace a <strong style={{ color: 'var(--s700)' }}>{email.trim()}</strong> para
                confirmar tu cuenta. Ábrelo para activarla y empezar.
              </div>
              <button onClick={() => navigate('/login')} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Ir al inicio de sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={sectionLabel}>Tu consultorio</div>
              <div style={inputWrap}>
                <Building2 size={16} color="var(--s400)" />
                <input value={orgName} onChange={e => setOrgName(e.target.value)}
                  placeholder="Nombre del consultorio o clínica" autoComplete="organization" style={input} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--s400)', margin: '-6px 2px 16px', lineHeight: 1.5 }}>
                Es el nombre de tu organización. Más adelante podrás invitar a otras personas a este consultorio.
              </div>

              <div style={sectionLabel}>Tú (administrador)</div>
              <div style={inputWrap}>
                <User size={16} color="var(--s400)" />
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Tu nombre completo" autoComplete="name" style={input} />
              </div>
              <div style={inputWrap}>
                <Mail size={16} color="var(--s400)" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Correo electrónico" autoComplete="email" style={input} />
              </div>
              <div style={inputWrap}>
                <Lock size={16} color="var(--s400)" />
                <input type={show ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)}
                  placeholder="Contraseña (mín. 8 caracteres)" autoComplete="new-password" style={input} />
                <button type="button" onClick={() => setShow(s => !s)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex' }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {err && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 9, padding: '9px 12px', marginBottom: 14 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />{err}
                </div>
              )}
              <button type="submit" disabled={state === 'saving'} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', background: state === 'saving' ? 'var(--s300)' : 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: state === 'saving' ? 'wait' : 'pointer', marginBottom: 16 }}>
                {state === 'saving' ? 'Creando consultorio…' : 'Crear consultorio'}
              </button>

              <div style={{ padding: '11px 13px', background: 'var(--s50)', borderRadius: 9, border: '1px solid var(--s200)', display: 'flex', gap: 9 }}>
                <ShieldCheck size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: 'var(--s500)', lineHeight: 1.6, margin: 0 }}>
                  Datos clínicos cifrados, bajo la <strong>Ley 1581/2012</strong> y Res. 1995/1999.
                </p>
              </div>
            </form>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
          ¿Ya tienes cuenta?{' '}
          <button type="button" onClick={() => navigate('/login')} style={{ border: 'none', background: 'none', padding: 0, fontSize: 13, color: '#fff', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
            Inicia sesión
          </button>
        </div>
      </div>
    </div>
  );
}
