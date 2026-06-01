import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Mail, Lock, Building2, Eye, EyeOff, ShieldCheck, AlertCircle, User, CreditCard, Award, Stethoscope, Phone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/api/auth';

/* ── Animated blobs ──────────────────────────────────────────── */
function Blobs() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {([
        { w: 320, h: 320, top: '-80px',   left: '-60px',  color: 'rgba(255,255,255,0.06)', delay: '0s'   },
        { w: 240, h: 240, top: '40%',     right: '-40px', color: 'rgba(255,255,255,0.04)', delay: '1.5s' },
        { w: 180, h: 180, bottom: '60px', left: '30%',    color: 'rgba(255,255,255,0.05)', delay: '3s'   },
        { w: 120, h: 120, top: '20%',     left: '20%',    color: 'rgba(255,255,255,0.06)', delay: '0.8s' },
      ] as const).map((b, i) => (
        <div key={i} style={{
          position: 'absolute', width: b.w, height: b.h, borderRadius: '50%',
          background: b.color,
          top: 'top' in b ? b.top : undefined,
          bottom: 'bottom' in b ? b.bottom : undefined,
          left: 'left' in b ? b.left : undefined,
          right: 'right' in b ? b.right : undefined,
          animation: `float 6s ease-in-out ${b.delay} infinite`,
        }} />
      ))}
    </div>
  );
}

/* ── Password field with toggle ──────────────────────────────── */
function PwField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>
        Contraseña <span style={{ color: 'var(--red)' }}>*</span>
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: focused ? '#fff' : 'var(--s50)',
        border: `1.5px solid ${error ? 'var(--red)' : focused ? 'var(--teal)' : 'var(--s200)'}`,
        borderRadius: 11, padding: '11px 14px', transition: 'all .15s',
        boxShadow: focused ? `0 0 0 3px rgba(20,184,166,0.12)` : 'none',
      }}>
        <Lock size={16} color={focused ? 'var(--teal)' : 'var(--s400)'} />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--s800)', minWidth: 0 }}
        />
        <button type="button" onClick={() => setShow(v => !v)} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--s400)', display: 'flex' }}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={12} />{error}</div>}
    </div>
  );
}

/* ── Text field ──────────────────────────────────────────────── */
function TField({ label, value, onChange, placeholder, icon: Icon, type = 'text', autoComplete, error, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; icon: React.ElementType; type?: string;
  autoComplete?: string; error?: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: focused ? '#fff' : 'var(--s50)',
        border: `1.5px solid ${error ? 'var(--red)' : focused ? 'var(--teal)' : 'var(--s200)'}`,
        borderRadius: 11, padding: '11px 14px', transition: 'all .15s',
        boxShadow: focused ? '0 0 0 3px rgba(20,184,166,0.12)' : 'none',
      }}>
        <Icon size={16} color={focused ? 'var(--teal)' : 'var(--s400)'} />
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--s800)', minWidth: 0 }}
        />
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={12} />{error}</div>}
    </div>
  );
}

/* ── Progress steps ──────────────────────────────────────────── */
function Steps({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} style={{ display: 'contents' }}>
            <div style={{
              width: active ? 28 : 22, height: 22, borderRadius: 99,
              background: done || active ? 'var(--teal)' : 'var(--s200)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
              color: done || active ? '#fff' : 'var(--s400)',
              boxShadow: active ? '0 0 0 4px rgba(20,184,166,0.20)' : 'none',
              transition: 'all .2s', flexShrink: 0,
            }}>
              {done ? '✓' : i + 1}
            </div>
            {i < total - 1 && (
              <div style={{ flex: 1, height: 2, borderRadius: 99, background: done ? 'var(--teal)' : 'var(--s200)', transition: 'background .3s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── PIN Numpad ──────────────────────────────────────────────── */
function PinPad({ pin, onChange }: { pin: string; onChange: (p: string) => void }) {
  const handleKey = (k: string) => {
    if (k === 'del') { onChange(pin.slice(0, -1)); return; }
    if (pin.length < 4) onChange(pin + k);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxWidth: 220, margin: '0 auto' }}>
      {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => {
        if (k === '') return <div key={i} />;
        return (
          <button key={i} type="button" onClick={() => handleKey(k)} style={{
            width: '100%', aspectRatio: '1', borderRadius: 99,
            border: '1.5px solid var(--s200)', background: 'var(--s50)',
            fontSize: k === 'del' ? 14 : 20, fontWeight: 700, color: 'var(--s700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--teal-l)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--teal)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--s50)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--s200)'; }}>
            {k === 'del' ? '⌫' : k}
          </button>
        );
      })}
    </div>
  );
}

/* ── Toggle switch ───────────────────────────────────────────── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      width: 44, height: 26, borderRadius: 99, border: 'none',
      background: value ? 'var(--teal)' : 'var(--s200)',
      position: 'relative', transition: 'background .2s', flexShrink: 0, cursor: 'pointer',
    }}>
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 20, height: 20, borderRadius: 99, background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left .2s',
      }} />
    </button>
  );
}

/* ── Main component ──────────────────────────────────────────── */
type Screen = 'login' | 'forgot' | 'register' | 'onboard';

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

export function LoginPage() {
  const { login, refreshUser, updateProfile, user } = useAuth();
  const navigate = useNavigate();

  const [screen,   setScreen]   = useState<Screen>('login');
  const [onbStep,  setOnbStep]  = useState(0);

  // Login fields
  const [org,      setOrg]      = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors,   setErrors]   = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(false);
  const [loginErr, setLoginErr] = useState('');

  // Register (invite code flow)
  const [regCode,        setRegCode]        = useState('');
  const [regEmail,       setRegEmail]       = useState('');
  const [regPassword,    setRegPassword]    = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regErr,         setRegErr]         = useState('');
  const [regLoading,     setRegLoading]     = useState(false);

  // Onboarding — step 0: Profile
  // Pre-fill with the display_name set during registration so the user doesn't re-type it.
  const [name,         setName]         = useState(user?.display_name ?? '');
  const [cedula,       setCedula]       = useState('');
  const [specialty,    setSpecialty]    = useState('Psicología clínica');
  const [regNum,       setRegNum]       = useState('');
  const [phone,        setPhone]        = useState('');

  // Onboarding — step 1: Schedule
  const [activeDays,   setActiveDays]   = useState(['Lun','Mar','Mié','Jue','Vie']);
  const [startHour,    setStartHour]    = useState('09:00');
  const [endHour,      setEndHour]      = useState('18:00');
  const [sessionLen,   setSessionLen]   = useState(50);

  // Onboarding — step 2: AI
  const [aiEnabled,    setAiEnabled]    = useState(true);
  const [soapStyle,    setSoapStyle]    = useState('structured');
  const [reminders,    setReminders]    = useState(true);

  // Onboarding — step 3: PIN
  const [pin,    setPin]    = useState('');
  const [pin2,   setPin2]   = useState('');
  const [pinErr, setPinErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const ONBOARD_TOTAL = 4;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!org.trim())   errs.org      = 'Requerido';
    if (!email.trim()) errs.email    = 'Ingresa un correo válido';
    if (!password)     errs.password = 'Requerido';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({}); setLoginErr(''); setLoading(true);
    try {
      const me = await login(org.trim().toLowerCase(), email.trim(), password);
      if (!localStorage.getItem(`sghcp_onboarding_done_${me.user_id}`)) {
        setScreen('onboard');
      } else {
        navigate('/');
      }
    } catch {
      setLoginErr('Credenciales incorrectas. Verifica organización, correo y contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (d: string) =>
    setActiveDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleFinish = async () => {
    if (pin.length < 4 || pin !== pin2) {
      setPinErr(pin.length < 4 ? 'El PIN debe tener 4 dígitos' : 'Los PINs no coinciden');
      return;
    }
    if (!user) return;
    setPinErr(''); setSaving(true);
    localStorage.setItem('sghcp_profile', JSON.stringify({ name, cedula, specialty, regNum, phone }));
    localStorage.setItem('sghcp_schedule', JSON.stringify({ activeDays, startHour, endHour, sessionLen }));
    localStorage.setItem('sghcp_ai_prefs', JSON.stringify({ aiEnabled, soapStyle, reminders }));
    localStorage.setItem(`sghcp_pin_${user.user_id}`, pin);
    localStorage.setItem(`sghcp_onboarding_done_${user.user_id}`, 'true');
    // Sync the onboarding name to the backend so display_name is always up-to-date.
    if (name.trim() && name.trim() !== user.display_name) {
      try { await updateProfile(name.trim()); } catch { /* non-blocking */ }
    }
    setSaving(false);
    setDone(true);
    await new Promise(r => setTimeout(r, 1500));
    navigate('/');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegErr(''); setRegLoading(true);
    try {
      const tokens = await authApi.register(regCode.trim().toUpperCase(), regEmail.trim(), regPassword, regDisplayName.trim());
      localStorage.setItem('access_token', tokens.access_token);
      localStorage.setItem('refresh_token', tokens.refresh_token);
      const me = await refreshUser(); // load user into context so handleFinish has user.user_id
      if (me?.display_name) setName(me.display_name); // pre-fill onboarding name field
      setScreen('onboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar';
      setRegErr(msg);
    } finally {
      setRegLoading(false);
    }
  };


  /* ── Layout wrapper ──────────────────────────────────────────── */
  return (
    <div className="bg-gradient" style={{
      width: '100%', height: '100%', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'auto', padding: '32px 16px',
    }}>
      <Blobs />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* ── LOGIN SCREEN ─────────────────────────────────────── */}
        {screen === 'login' && (
          <div className="anim-scale-in" style={{ width: '100%', maxWidth: 420 }}>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div className="anim-float" style={{
                width: 68, height: 68, borderRadius: 20,
                background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 18px',
              }}>
                <Brain size={32} color="white" />
              </div>
              <div style={{ fontWeight: 900, fontSize: 26, color: '#fff', letterSpacing: '-0.6px', marginBottom: 4 }}>SGHCP</div>
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)' }}>Sistema de Gestión de Historias Clínicas Psicológicas</div>
            </div>

            {/* Card */}
            <div className="glass" style={{ borderRadius: 20, padding: '30px 32px', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}>
              <div style={{ fontWeight: 800, fontSize: 19, color: 'var(--s800)', marginBottom: 4 }}>Iniciar sesión</div>
              <div style={{ fontSize: 13, color: 'var(--s400)', marginBottom: 24 }}>Accede a tu cuenta profesional</div>

              <form onSubmit={handleLogin}>
                <TField label="Organización" value={org} onChange={v => { setOrg(v); setErrors(e => ({...e, org: ''})); }}
                  placeholder="slug-de-tu-clinica" icon={Building2} autoComplete="organization" error={errors.org} required />
                <TField label="Correo electrónico" value={email} onChange={v => { setEmail(v); setErrors(e => ({...e, email: ''})); }}
                  placeholder="nombre@clinica.com" icon={Mail} type="email" autoComplete="email" error={errors.email} required />
                <PwField value={password} onChange={v => { setPassword(v); setErrors(e => ({...e, password: ''})); }} error={errors.password} />

                {loginErr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
                    <AlertCircle size={14} />
                    {loginErr}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--s600)' }}>
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor: 'var(--teal)', width: 15, height: 15 }} />
                    Recordarme
                  </label>
                  <button type="button" onClick={() => setScreen('forgot')} style={{ border: 'none', background: 'none', fontSize: 13, color: 'var(--teal)', fontWeight: 600, cursor: 'pointer' }}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none',
                  background: loading ? 'var(--s200)' : 'linear-gradient(135deg, var(--teal) 0%, var(--teal-d) 100%)',
                  color: loading ? 'var(--s400)' : '#fff',
                  fontSize: 15, fontWeight: 800, letterSpacing: '-0.2px',
                  boxShadow: loading ? 'none' : '0 4px 18px rgba(14,118,110,0.40)',
                  transition: 'all .18s', marginBottom: 16, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                }}>
                  {loading ? (
                    <><span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Verificando…</>
                  ) : (
                    <>Ingresar al sistema</>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--s200)' }} />
                <span style={{ fontSize: 12, color: 'var(--s400)', fontWeight: 500 }}>o continúa con</span>
                <div style={{ flex: 1, height: 1, background: 'var(--s200)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <button type="button" disabled title="Próximamente" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px', borderRadius: 10, border: '1.5px solid var(--s200)',
                  background: 'var(--s50)', color: 'var(--s400)', fontSize: 13, fontWeight: 600,
                  cursor: 'not-allowed', opacity: 0.7,
                }}>
                  SSO Clínica
                </button>
                <button type="button" onClick={() => setScreen('register')} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px', borderRadius: 10, border: '1.5px solid var(--s200)',
                  background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 600,
                  transition: 'all .12s', cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#7c3aed'; (e.currentTarget as HTMLElement).style.color = '#7c3aed'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--s200)'; (e.currentTarget as HTMLElement).style.color = 'var(--s600)'; }}>
                  Código de invitación
                </button>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--s50)', borderRadius: 9, border: '1px solid var(--s200)', display: 'flex', gap: 9 }}>
                <ShieldCheck size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: 'var(--s500)', lineHeight: 1.6, margin: 0 }}>
                  Sesión protegida con cifrado TLS 1.3. Datos clínicos bajo la <strong>Ley 1581/2012</strong> y Res. 1995/1999.
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              SGHCP v0.4 · © 2026 · Política de privacidad
            </div>
          </div>
        )}

        {/* ── FORGOT PASSWORD ───────────────────────────────────── */}
        {screen === 'forgot' && (
          <div className="anim-scale-in" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1.5px solid rgba(255,255,255,0.20)' }}>
                <Lock size={26} color="white" />
              </div>
              <div style={{ fontWeight: 800, fontSize: 22, color: '#fff', marginBottom: 6 }}>¿Olvidaste tu contraseña?</div>
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                El administrador de tu clínica puede restablecerla.
              </div>
            </div>
            <div className="glass" style={{ borderRadius: 18, padding: '28px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--s800)', marginBottom: 10 }}>
                  Contacta a tu administrador
                </div>
                <div style={{ fontSize: 13, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 8 }}>
                  Por seguridad, el restablecimiento de contraseñas requiere la intervención del administrador de tu organización.
                </div>
                <div style={{ fontSize: 13, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 24, padding: '10px 14px', background: 'var(--s50)', borderRadius: 9, border: '1px solid var(--s200)' }}>
                  <strong>Si eres el administrador,</strong> ingresa al panel de Configuración → Usuarios y usa la opción "Restablecer contraseña".
                </div>
                <button onClick={() => setScreen('login')} style={{ width: '100%', padding: 11, borderRadius: 11, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  ← Volver al inicio de sesión
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── REGISTER (invite code) ────────────────────────────── */}
        {screen === 'register' && (
          <div className="anim-scale-in" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1.5px solid rgba(255,255,255,0.20)' }}>
                <User size={26} color="white" />
              </div>
              <div style={{ fontWeight: 800, fontSize: 22, color: '#fff', marginBottom: 6 }}>Crear cuenta</div>
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                Ingresa el código de invitación que te compartió el administrador.
              </div>
            </div>
            <div className="glass" style={{ borderRadius: 18, padding: '28px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <form onSubmit={handleRegister}>
                <TField label="Código de invitación" value={regCode} onChange={v => { setRegCode(v); setRegErr(''); }}
                  placeholder="XXXXXXXX" icon={Award} required />
                <TField label="Nombre completo" value={regDisplayName} onChange={setRegDisplayName}
                  placeholder="Dra. / Dr. Nombre Apellido" icon={User} required />
                <TField label="Correo electrónico" value={regEmail} onChange={setRegEmail}
                  placeholder="nombre@clinica.com" icon={Mail} type="email" required />
                <PwField value={regPassword} onChange={setRegPassword} />

                {regErr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
                    <AlertCircle size={14} />{regErr}
                  </div>
                )}

                <button type="submit" disabled={regLoading} style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none',
                  background: regLoading ? 'var(--s200)' : 'linear-gradient(135deg, var(--teal) 0%, var(--teal-d) 100%)',
                  color: regLoading ? 'var(--s400)' : '#fff',
                  fontSize: 15, fontWeight: 800, marginBottom: 12,
                  boxShadow: regLoading ? 'none' : '0 4px 18px rgba(14,118,110,0.40)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: regLoading ? 'not-allowed' : 'pointer',
                }}>
                  {regLoading
                    ? <><span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Creando cuenta…</>
                    : 'Crear cuenta'}
                </button>
                <button type="button" onClick={() => setScreen('login')} style={{ width: '100%', padding: 10, borderRadius: 11, border: '1.5px solid var(--s200)', background: 'transparent', color: 'var(--s500)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
                  ← Volver al inicio de sesión
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── ONBOARDING ────────────────────────────────────────── */}
        {screen === 'onboard' && (
          <div className="anim-scale-in" style={{ width: '100%', maxWidth: 520 }}>
            {/* Logo small */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                <Brain size={20} color="white" />
              </div>
              <span style={{ fontWeight: 800, fontSize: 18, color: '#fff', letterSpacing: '-0.3px' }}>SGHCP</span>
            </div>

            <div className="glass" style={{ borderRadius: 20, padding: '28px 32px', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}>
              {done ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                  <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--s800)', marginBottom: 8 }}>¡Todo listo!</div>
                  <div style={{ fontSize: 14, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 24 }}>Tu perfil ha sido configurado.<br />Accediendo al sistema…</div>
                  <span style={{ width: 20, height: 20, border: '2.5px solid rgba(20,184,166,.3)', borderTopColor: 'var(--teal)', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />
                </div>
              ) : (
                <>
                  <Steps step={onbStep} total={ONBOARD_TOTAL} />

                  {/* Step header */}
                  {(() => {
                    const headers = [
                      { icon: '👤', title: 'Tu perfil profesional', sub: 'Estos datos aparecerán en los documentos clínicos firmados.' },
                      { icon: '📅', title: 'Configurar horario',   sub: 'Define cuándo y cómo quieres atender pacientes.' },
                      { icon: '✨', title: 'Preferencias IA',       sub: 'Personaliza cómo el asistente IA redacta tus notas clínicas.' },
                      { icon: '🔒', title: 'PIN de seguridad',      sub: 'El PIN bloquea tu pantalla tras 5 min de inactividad.' },
                    ];
                    const h = headers[onbStep];
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>{h.icon}</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--s800)', letterSpacing: '-0.3px' }}>{h.title}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--s400)', marginTop: 2 }}>{h.sub}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 0: Profile */}
                  {onbStep === 0 && (
                    <div className="anim-fade-up">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                        <div style={{ gridColumn: '1/-1' }}>
                          <TField label="Nombre completo con título" value={name} onChange={setName} placeholder="Dra. / Dr. Nombre Apellido" icon={User} required />
                        </div>
                        <TField label="Cédula / RUT" value={cedula} onChange={setCedula} placeholder="1.234.567-8" icon={CreditCard} required />
                        <TField label="Nº de registro" value={regNum} onChange={setRegNum} placeholder="Ej: 4891-RM" icon={Award} required />
                        <div style={{ gridColumn: '1/-1' }}>
                          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>
                            Especialidad <span style={{ color: 'var(--red)' }}>*</span>
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--s50)', border: '1.5px solid var(--s200)', borderRadius: 11, padding: '11px 14px', marginBottom: 16 }}>
                            <Stethoscope size={16} color="var(--s400)" />
                            <select value={specialty} onChange={e => setSpecialty(e.target.value)}
                              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--s800)', minWidth: 0, outline: 'none' }}>
                              {['Psicología clínica','Psicología educativa','Psicología organizacional','Neuropsicología','Psicología forense','Psicología de la salud','Psicoanálisis','Psicología cognitivo-conductual','Psicología sistémica','Otra'].map(s => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                          <TField label="Teléfono de contacto" value={phone} onChange={setPhone} placeholder="+57 300 000 0000" icon={Phone} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 1: Schedule */}
                  {onbStep === 1 && (
                    <div className="anim-fade-up">
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>Días de atención</div>
                        <div style={{ display: 'flex', gap: 7 }}>
                          {DAYS_SHORT.map(d => {
                            const on = activeDays.includes(d);
                            return (
                              <button key={d} type="button" onClick={() => toggleDay(d)} style={{
                                flex: 1, padding: '10px 4px', borderRadius: 9,
                                border: `1.5px solid ${on ? 'var(--teal)' : 'var(--s200)'}`,
                                background: on ? 'var(--teal)' : '#fff',
                                color: on ? '#fff' : 'var(--s500)',
                                fontSize: 12, fontWeight: on ? 700 : 400, transition: 'all .12s', cursor: 'pointer',
                              }}>{d}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Hora de inicio</div>
                          <select value={startHour} onChange={e => setStartHour(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--s200)', borderRadius: 10, fontSize: 13.5, color: 'var(--s700)', background: '#fff' }}>
                            {HOURS.map(h => <option key={h}>{h}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Hora de fin</div>
                          <select value={endHour} onChange={e => setEndHour(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--s200)', borderRadius: 10, fontSize: 13.5, color: 'var(--s700)', background: '#fff' }}>
                            {HOURS.map(h => <option key={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>Duración por defecto de sesión</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[30, 45, 50, 60, 90].map(d => (
                            <button key={d} type="button" onClick={() => setSessionLen(d)} style={{
                              flex: 1, padding: '10px 4px', borderRadius: 9,
                              border: `1.5px solid ${sessionLen === d ? 'var(--teal)' : 'var(--s200)'}`,
                              background: sessionLen === d ? 'var(--teal-l)' : '#fff',
                              color: sessionLen === d ? 'var(--teal-d)' : 'var(--s500)',
                              fontWeight: sessionLen === d ? 700 : 400, fontSize: 13, transition: 'all .12s', cursor: 'pointer',
                            }}>{d}<span style={{ fontSize: 10 }}>m</span></button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: AI */}
                  {onbStep === 2 && (
                    <div className="anim-fade-up">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fde68a', borderRadius: 13, marginBottom: 20 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>✨</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#78350f' }}>Asistente IA de redacción</div>
                          <div style={{ fontSize: 12.5, color: '#92400e', marginTop: 2, lineHeight: 1.5 }}>Transcribe y redacta borradores SOAP automáticamente desde el audio.</div>
                        </div>
                        <Toggle value={aiEnabled} onChange={setAiEnabled} />
                      </div>

                      {aiEnabled && (
                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 10 }}>Estilo de redacción SOAP</div>
                          {[
                            { id: 'structured', label: 'Estructurado y formal', desc: 'Lenguaje técnico-clínico estándar.' },
                            { id: 'narrative',  label: 'Narrativo',             desc: 'Redacción fluida, como nota clínica convencional.' },
                            { id: 'bullet',     label: 'Listas con viñetas',    desc: 'Puntos concisos, rápido de revisar.' },
                          ].map(opt => {
                            const sel = soapStyle === opt.id;
                            return (
                              <button key={opt.id} type="button" onClick={() => setSoapStyle(opt.id)} style={{
                                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', width: '100%',
                                borderRadius: 10, border: `1.5px solid ${sel ? 'var(--teal)' : 'var(--s200)'}`,
                                background: sel ? 'var(--teal-l)' : '#fff', textAlign: 'left', transition: 'all .12s', cursor: 'pointer', marginBottom: 8,
                              }}>
                                <div style={{ width: 20, height: 20, borderRadius: 99, border: `2px solid ${sel ? 'var(--teal)' : 'var(--s300)'}`, background: sel ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                  {sel && <div style={{ width: 8, height: 8, borderRadius: 99, background: '#fff' }} />}
                                </div>
                                <div>
                                  <div style={{ fontSize: 13.5, fontWeight: sel ? 700 : 500, color: sel ? 'var(--teal-d)' : 'var(--s800)' }}>{opt.label}</div>
                                  <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{opt.desc}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ padding: '14px 16px', background: 'var(--s50)', borderRadius: 11, border: '1px solid var(--s200)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14 }}>🔔</span>
                            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--s700)' }}>Recordatorios automáticos</span>
                          </div>
                          <Toggle value={reminders} onChange={setReminders} />
                        </div>
                        {reminders && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 8 }}>Se enviará recordatorio 24h antes de cada cita.</div>}
                      </div>
                    </div>
                  )}

                  {/* Step 3: PIN */}
                  {onbStep === 3 && (
                    <div className="anim-fade-up">
                      <div style={{ padding: '16px 18px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 11, marginBottom: 22, display: 'flex', gap: 10 }}>
                        <span style={{ fontSize: 14 }}>ℹ️</span>
                        <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.65, margin: 0 }}>
                          El PIN de 4 dígitos bloquea automáticamente tu pantalla tras 5 minutos de inactividad.
                        </p>
                      </div>

                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>Crea tu PIN <span style={{ color: 'var(--red)' }}>*</span></div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 4 }}>
                          {[0, 1, 2, 3].map(i => (
                            <div key={i} style={{ width: 52, height: 60, borderRadius: 12, border: `2px solid ${pin.length > i ? 'var(--teal)' : 'var(--s200)'}`, background: pin.length > i ? 'var(--teal-l)' : 'var(--s50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: 'var(--teal)', transition: 'all .15s' }}>
                              {pin.length > i ? '•' : ''}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>Confirma tu PIN <span style={{ color: 'var(--red)' }}>*</span></div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 4 }}>
                          {[0, 1, 2, 3].map(i => (
                            <div key={i} style={{ width: 52, height: 60, borderRadius: 12, border: `2px solid ${pin2.length > i ? (pin2[i] === pin[i] ? '#10b981' : 'var(--red)') : 'var(--s200)'}`, background: pin2.length > i ? '#f0fdf4' : 'var(--s50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: pin2.length > i ? '#10b981' : 'var(--s300)', transition: 'all .15s' }}>
                              {pin2.length > i ? '•' : ''}
                            </div>
                          ))}
                        </div>
                        {pinErr && <div style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><AlertCircle size={12} />{pinErr}</div>}
                      </div>

                      <PinPad
                        pin={pin.length < 4 ? pin : pin2}
                        onChange={newVal => {
                          if (pin.length < 4) setPin(newVal);
                          else { setPin2(newVal); setPinErr(''); }
                        }}
                      />
                    </div>
                  )}

                  {/* Navigation */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
                    {onbStep > 0 && (
                      <button type="button" onClick={() => setOnbStep(s => s - 1)} style={{ padding: '11px 18px', borderRadius: 11, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                        ← Atrás
                      </button>
                    )}
                    {onbStep < ONBOARD_TOTAL - 1 ? (
                      <button type="button" onClick={() => setOnbStep(s => s + 1)} style={{
                        flex: 1, padding: 12, borderRadius: 11, border: 'none',
                        background: 'linear-gradient(135deg,var(--teal),var(--teal-d))',
                        color: '#fff', fontSize: 14.5, fontWeight: 800,
                        boxShadow: '0 4px 14px rgba(14,118,110,0.35)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        Continuar →
                      </button>
                    ) : (
                      <button type="button" onClick={handleFinish} disabled={saving} style={{
                        flex: 1, padding: 12, borderRadius: 11, border: 'none',
                        background: saving ? 'var(--s200)' : 'linear-gradient(135deg,#10b981,#059669)',
                        color: saving ? 'var(--s400)' : '#fff', fontSize: 14.5, fontWeight: 800,
                        boxShadow: saving ? 'none' : '0 4px 14px rgba(16,185,129,0.40)', cursor: saving ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        {saving ? (
                          <><span style={{ width: 16, height: 16, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} /> Guardando…</>
                        ) : (
                          <>✓ Finalizar configuración</>
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.50)' }}>
              Paso {onbStep + 1} de {ONBOARD_TOTAL}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
