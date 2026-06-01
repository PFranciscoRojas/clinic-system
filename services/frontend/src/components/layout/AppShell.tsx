import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  CalendarDays, Users, ClipboardList, Receipt, Settings,
  Brain, Bell, Search, Plus, ChevronDown, Lock, LogOut,
  UserCircle, Calendar, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const NAV = [
  { to: '/',            label: 'Agenda',        Icon: CalendarDays,  perm: 'appointments:read', badge: null },
  { to: '/patients',    label: 'Pacientes',      Icon: Users,         perm: 'patients:read',     badge: null },
  { to: '/evaluations', label: 'Evaluaciones',   Icon: ClipboardList, perm: null,                badge: 2   },
  { to: '/billing',     label: 'Facturación',    Icon: Receipt,       perm: null,                badge: null },
  { to: '/settings',    label: 'Configuración',  Icon: Settings,      perm: null,                badge: null },
];

interface Props { children: ReactNode }

export function AppShell({ children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [locked,      setLocked]      = useState(false);
  const [search,      setSearch]      = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const profileRef  = useRef<HTMLDivElement>(null);
  const notifRef    = useRef<HTMLDivElement>(null);
  const idleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_MS     = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current   && !notifRef.current.contains(e.target as Node))   setNotifOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Auto-lock after IDLE_MS of inactivity — only when PIN is set.
  useEffect(() => {
    const hasPin = !!localStorage.getItem(`sghcp_pin_${user?.user_id}`);
    if (!hasPin) return;

    const resetTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setLocked(true), IDLE_MS);
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'click'] as const;
    events.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, []);

  const emailPrefix = user?.email?.split('@')[0] ?? '';
  const displayName = user?.display_name || emailPrefix || user?.email || '';
  const initials = (() => {
    if (user?.display_name) {
      const words = user.display_name.trim().split(/\s+/);
      const first = words[0]?.[0] ?? '';
      const last  = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
      return (first + last).toUpperCase() || '?';
    }
    return emailPrefix.slice(0, 2).toUpperCase() || '?';
  })();
  const ROLE_LABEL: Record<string, string> = {
    CLINIC_ADMIN: 'Administrador',
    PROFESSIONAL: 'Psicólogo/a',
    INTERN: 'Practicante',
    RECEPTIONIST: 'Recepcionista',
  };
  const roleLabel = user?.roles?.[0] ? (ROLE_LABEL[user.roles[0]] ?? user.roles[0]) : '';
  const savedSpecialty = (() => {
    try { return JSON.parse(localStorage.getItem('sghcp_profile') ?? '{}').specialty ?? ''; } catch { return ''; }
  })();
  const subtitleLabel = savedSpecialty || roleLabel;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {locked && <LockScreen userId={user?.user_id} onUnlock={() => setLocked(false)} />}
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside style={{
          width: 'var(--sidebar-w)', minHeight: '100vh', flexShrink: 0,
          background: 'var(--teal-d)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '2px 0 16px rgba(0,0,0,.10)',
          position: 'relative', zIndex: 10,
        }}>
          {/* Logo */}
          <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,.10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Brain size={18} color="white" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', letterSpacing: '-0.2px' }}>SGHCP</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', marginTop: 1 }}>Salud Mental Pro</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ padding: '16px 12px', flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.40)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>
              Principal
            </div>
            {NAV.map(({ to, label, Icon, badge }) => {
              const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
              return (
                <Link key={to} to={to} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                  background: active ? 'rgba(255,255,255,.18)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,.65)',
                  fontSize: 13.5, fontWeight: active ? 600 : 400,
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.09)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Icon size={16} color={active ? '#fff' : 'rgba(255,255,255,.65)'} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badge !== null && (
                    <span style={{ background: '#f59e0b', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9999, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User mini card */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.50)' }}>{subtitleLabel}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main area ───────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Topbar */}
          <header style={{
            height: 'var(--topbar-h)', background: '#fff',
            borderBottom: '1px solid var(--s200)',
            display: 'flex', alignItems: 'center',
            padding: '0 24px', gap: 12,
            position: 'sticky', top: 0, zIndex: 20,
          }}>
            {/* Search */}
            <div style={{
              flex: 1, maxWidth: 400,
              display: 'flex', alignItems: 'center', gap: 8,
              background: searchFocus ? '#fff' : 'var(--s50)',
              border: `1.5px solid ${searchFocus ? 'var(--teal)' : 'var(--s200)'}`,
              borderRadius: 10, padding: '8px 14px',
              transition: 'all .15s',
              boxShadow: searchFocus ? '0 0 0 3px rgba(20,184,166,.12)' : 'none',
            }}>
              <Search size={15} color={searchFocus ? 'var(--teal)' : 'var(--s400)'} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                onFocus={() => setSearchFocus(true)} onBlur={() => setSearchFocus(false)}
                placeholder="Buscar paciente, cita…"
                style={{ border: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--s700)', width: '100%' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', padding: 0, display: 'flex', color: 'var(--s400)' }}>
                  <X size={13} />
                </button>
              )}
              <kbd style={{ fontSize: 10, color: 'var(--s400)', background: 'var(--s100)', border: '1px solid var(--s200)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>⌘K</kbd>
            </div>

            <div style={{ flex: 1 }} />

            {/* Nueva Cita */}
            <Link to="/appointments/new" style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10,
              padding: '9px 16px', fontSize: 13.5, fontWeight: 600,
              boxShadow: '0 2px 8px rgba(20,184,166,.40)',
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.08)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}
            >
              <Plus size={16} color="white" />
              Nueva Cita
            </Link>

            {/* Notifications */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button onClick={() => { setNotifOpen(v => !v); setProfileOpen(false); }} style={{
                width: 38, height: 38, borderRadius: '50%',
                background: notifOpen ? 'var(--teal-l)' : 'var(--s50)',
                border: `1.5px solid ${notifOpen ? 'var(--teal)' : 'var(--s200)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', position: 'relative', transition: 'all .15s',
              }}>
                <Bell size={16} color={notifOpen ? 'var(--teal)' : 'var(--s500)'} />
                <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', border: '2px solid #fff', animation: 'pulse 2s infinite' }} />
              </button>
              {notifOpen && (
                <div className="anim-fade-in" style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 300, background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 100 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--s100)', fontWeight: 600, fontSize: 13.5, color: 'var(--s800)' }}>Notificaciones</div>
                  <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--s500)', textAlign: 'center' }}>Sin notificaciones nuevas</div>
                </div>
              )}
            </div>

            {/* Profile */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button onClick={() => { setProfileOpen(v => !v); setNotifOpen(false); }} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: profileOpen ? 'var(--s100)' : 'var(--s50)',
                border: '1.5px solid var(--s200)', borderRadius: 10,
                padding: '5px 10px 5px 5px', cursor: 'pointer', transition: 'all .15s',
              }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), var(--teal-d))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                  {initials}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--s700)' }}>{displayName}</span>
                <ChevronDown size={13} color="var(--s400)" style={{ transform: profileOpen ? 'rotate(180deg)' : '', transition: 'transform .2s' }} />
              </button>
              {profileOpen && (
                <div className="anim-fade-in" style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 220, background: '#fff', borderRadius: 12, border: '1px solid var(--s200)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 100 }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--s100)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--s800)' }}>{displayName}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--s500)', marginTop: 2 }}>{user?.email ?? '—'}</div>
                  </div>
                  {[
                    { Icon: UserCircle, label: 'Mi perfil',      action: () => { navigate('/settings'); setProfileOpen(false); } },
                    { Icon: Calendar,   label: 'Mi agenda',      action: () => { navigate('/'); setProfileOpen(false); } },
                    { Icon: Settings,   label: 'Configuración',  action: () => { navigate('/settings'); setProfileOpen(false); } },
                  ].map(({ Icon, label, action }) => (
                    <button key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--s700)', textAlign: 'left', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Icon size={14} color="var(--s500)" />{label}
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid var(--s100)' }}>
                    <button onClick={() => { setLocked(true); setProfileOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--red)', textAlign: 'left', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fff5f5')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Lock size={14} color="var(--red)" />Bloquear pantalla
                    </button>
                    <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--s500)', textAlign: 'left', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <LogOut size={14} color="var(--s400)" />Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </header>

          <main style={{ flex: 1, overflow: 'auto' }}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

/* ── Lock screen ────────────────────────────────────────────────── */
function LockScreen({ userId, onUnlock }: { userId?: string; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  const handleKey = (k: string) => {
    if (k === 'del') { setPin(p => p.slice(0, -1)); return; }
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      const saved = localStorage.getItem(userId ? `sghcp_pin_${userId}` : '') ?? '';
      if (next === saved) { onUnlock(); setPin(''); }
      else { setShake(true); setTimeout(() => { setShake(false); setPin(''); }, 500); }
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.88)', backdropFilter: 'blur(16px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .25s ease' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Lock size={26} color="white" />
        </div>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Pantalla bloqueada</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginBottom: 32 }}>Ingresa el PIN para continuar</div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 32, transform: shake ? 'translateX(8px)' : '', transition: 'transform .1s' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pin.length ? '#fff' : 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.4)', transition: 'background .15s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 220, margin: '0 auto' }}>
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => (
            k === '' ? <div key={i} /> : (
              <button key={i} onClick={() => handleKey(k)} style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', background: 'rgba(255,255,255,.10)', border: '1.5px solid rgba(255,255,255,.15)', color: '#fff', fontSize: k === 'del' ? 12 : 20, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.20)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.10)')}>
                {k === 'del' ? '⌫' : k}
              </button>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
