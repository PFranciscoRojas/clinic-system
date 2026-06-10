import { useState } from 'react';
import {
  UserRound, Clock, Bell, Sparkles, ShieldCheck, CreditCard,
  FileText, Plug, Settings, CalendarDays, Send, AlertCircle,
  PenLine, Lock, Monitor, Smartphone, Tablet, Key, CheckCircle,
  Upload, Palette, Star, Users, Trash2, Save, HardDrive,
  Video, MessageCircle, Shield, LogOut, Plus,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { consentTemplatesApi, type ConsentType } from '@/api/clinicalRecords';
import { ACCENT_COLORS, saveAccentColor } from '@/lib/theme';

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionId = 'profile' | 'schedule' | 'notifications' | 'ai' | 'security' | 'billing' | 'templates' | 'integrations' | 'users';

const SECTIONS: { id: SectionId; icon: React.ElementType; label: string; color?: string }[] = [
  { id: 'profile',       icon: UserRound,  label: 'Perfil profesional' },
  { id: 'schedule',      icon: Clock,       label: 'Horario y agenda'   },
  { id: 'notifications', icon: Bell,        label: 'Notificaciones'     },
  { id: 'ai',            icon: Sparkles,    label: 'Asistente IA',       color: '#f59e0b' },
  { id: 'security',      icon: ShieldCheck, label: 'Seguridad',          color: '#ef4444' },
  { id: 'billing',       icon: CreditCard,  label: 'Plan y facturación', color: '#10b981' },
  { id: 'templates',     icon: FileText,    label: 'Plantillas clínicas',color: '#8b5cf6' },
  { id: 'integrations',  icon: Plug,        label: 'Integraciones',      color: '#6366f1' },
  { id: 'users',         icon: Users,       label: 'Usuarios',            color: '#0ea5e9' },
];

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  CLINIC_ADMIN:  { color: '#065f46', bg: '#d1fae5' },
  PROFESSIONAL:  { color: '#0369a1', bg: '#e0f2fe' },
  INTERN:        { color: '#92400e', bg: '#fef3c7' },
  RECEPTIONIST:  { color: '#4c1d95', bg: '#ede9fe' },
  SYSTEM_ADMIN:  { color: '#991b1b', bg: '#fee2e2' },
};

// ── Primitives ────────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label, sub, disabled }: {
  value: boolean; onChange: (v: boolean) => void;
  label: string; sub?: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--s100)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: disabled ? 'var(--s400)' : 'var(--s800)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{sub}</div>}
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        style={{ width: 44, height: 26, borderRadius: 99, border: 'none', background: value && !disabled ? 'var(--teal)' : 'var(--s200)', position: 'relative', transition: 'background .2s', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', top: 3, left: value && !disabled ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
      </button>
    </div>
  );
}

function FieldRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
      <div style={{ flex: 1, paddingTop: 2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--s800)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, minWidth: 220 }}>{children}</div>
    </div>
  );
}

function FInput({ value, onChange, placeholder, type = 'text', mono, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; mono?: boolean; disabled?: boolean;
}) {
  const [f, setF] = useState(false);
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{
        width: '100%', padding: '8px 12px',
        border: `1.5px solid ${f ? 'var(--teal)' : 'var(--s200)'}`,
        borderRadius: 9, fontSize: 13.5, color: 'var(--s800)', background: disabled ? 'var(--s50)' : '#fff',
        boxShadow: f ? '0 0 0 3px rgba(20,184,166,0.12)' : 'none',
        transition: 'all .15s',
        fontFamily: mono ? "'DM Mono', monospace" : "'DM Sans', sans-serif",
      }}
    />
  );
}

function FSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--s200)', borderRadius: 9, fontSize: 13.5, color: 'var(--s700)', background: '#fff', cursor: 'pointer' }}
    >
      {children}
    </select>
  );
}

function SectionCard({ title, icon: Icon, color = 'var(--teal)', children }: {
  title: string; icon: React.ElementType; color?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--s100)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>{title}</span>
      </div>
      <div style={{ padding: '4px 22px 8px' }}>{children}</div>
    </div>
  );
}

// ── SaveBar ───────────────────────────────────────────────────────────────────

function SaveBar({ dirty, saving, saved, onSave }: {
  dirty: boolean; saving: boolean; saved: boolean; onSave: (doSave: boolean) => void;
}) {
  if (!dirty && !saved) return null;
  return (
    <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid var(--s200)', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', zIndex: 10 }}>
      <span style={{ fontSize: 13, color: saved ? '#10b981' : 'var(--s500)' }}>
        {saved ? '✓ Cambios guardados' : 'Tienes cambios sin guardar'}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {dirty && (
          <button
            onClick={() => onSave(false)}
            style={{ padding: '8px 18px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Descartar
          </button>
        )}
        <button
          onClick={() => onSave(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 8px rgba(20,184,166,.35)', transition: 'filter .15s', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.07)')}
          onMouseLeave={e => (e.currentTarget.style.filter = '')}
        >
          {saving
            ? <span style={{ width: 14, height: 14, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />
            : <Save size={14} />
          }
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

// ── Chip button helper ────────────────────────────────────────────────────────

function ChipBtn({ active, color = 'var(--teal)', onClick, children }: {
  active: boolean; color?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 4px', borderRadius: 9, fontSize: 13, transition: 'all .12s', cursor: 'pointer',
        border: `1.5px solid ${active ? color : 'var(--s200)'}`,
        background: active ? color + '1a' : '#fff',
        color: active ? color : 'var(--s500)',
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
    </button>
  );
}

// ── Profile section ───────────────────────────────────────────────────────────

function ProfileSection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const { user, logout, updateProfile } = useAuth();
  const mark = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  const savedProfile = (() => { try { return JSON.parse(localStorage.getItem('sghcp_profile') ?? '{}'); } catch { return {}; } })();
  // display_name from the JWT is the source of truth; localStorage is only a fallback for fields not yet in the backend.
  const [name,      setName]      = useState(user?.display_name || savedProfile.name || '');
  const [specialty, setSpecialty] = useState(savedProfile.specialty ?? 'Psicología clínica');
  const [email,     setEmail]     = useState(user?.email ?? '');
  const [phone,     setPhone]     = useState(savedProfile.phone ?? '');
  const [bio,       setBio]       = useState('');
  const savedAccent = localStorage.getItem(`sghcp_accent_${user?.user_id}`) ?? '#14b8a6';
  const [color,     setColor]     = useState(savedAccent);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveErr,   setSaveErr]   = useState('');

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSaving(true); setSaveErr('');
    try {
      await updateProfile(name.trim());
      localStorage.setItem('sghcp_profile', JSON.stringify({ ...savedProfile, name: name.trim(), specialty, phone }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setDirty(false);
    } catch {
      setSaveErr('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // ACCENT_COLORS imported from lib/theme
  const ini = (() => {
    if (user?.display_name) {
      const words = user.display_name.trim().split(/\s+/);
      const first = words[0]?.[0] ?? '';
      const last  = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
      return (first + last).toUpperCase() || '?';
    }
    return user?.email?.split('@')[0]?.slice(0, 2).toUpperCase() || '?';
  })();

  return (
    <>
      <SectionCard title="Datos personales y profesionales" icon={UserRound}>
        <FieldRow label="Nombre completo con título" sub="Aparece en documentos firmados">
          <FInput value={name} onChange={mark(setName)} placeholder="Dra. Nombre Apellido" />
        </FieldRow>
        <FieldRow label="Especialidad">
          <FSelect value={specialty} onChange={mark(setSpecialty)}>
            {['Psicología clínica','Psicología educativa','Psicología organizacional','Neuropsicología','Psicología forense','Psicología de la salud','Psicoanálisis','Psicología cognitivo-conductual','Psicología sistémica','Psicología infantil','Psiquiatría','Otra'].map(s => <option key={s}>{s}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Correo electrónico">
          <FInput value={email} onChange={mark(setEmail)} type="email" />
        </FieldRow>
        <FieldRow label="Teléfono">
          <FInput value={phone} onChange={mark(setPhone)} type="tel" placeholder="+57 3XX XXX XXXX" />
        </FieldRow>
        <FieldRow label="Bio profesional" sub="Se muestra en el portal de pacientes">
          <textarea
            value={bio}
            onChange={e => { setBio(e.target.value); setDirty(true); }}
            rows={3}
            placeholder="Psicólogo/a clínico/a con experiencia en…"
            style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--s200)', borderRadius: 9, fontSize: 13.5, lineHeight: 1.65, color: 'var(--s800)', resize: 'vertical', fontFamily: "'DM Sans', sans-serif" }}
            onFocus={e => (e.target.style.borderColor = 'var(--teal)')}
            onBlur={e => (e.target.style.borderColor = 'var(--s200)')}
          />
        </FieldRow>
        <div style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleSaveName} disabled={saving} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px',
            borderRadius: 9, border: 'none',
            background: saving ? 'var(--s200)' : 'var(--teal)',
            color: saving ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Guardando…</>
              : <><Save size={13} />Guardar nombre</>}
          </button>
          {saved    && <span style={{ fontSize: 12.5, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={13} />Nombre actualizado</span>}
          {saveErr  && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{saveErr}</span>}
        </div>
      </SectionCard>

      <SectionCard title="Apariencia del perfil" icon={Palette}>
        <FieldRow label="Color de acento" sub="Cambia el color del sidebar y botones en toda la app">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {ACCENT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); saveAccentColor(c, user?.user_id); setDirty(false); }}
                title={c}
                style={{ width: 30, height: 30, borderRadius: 99, background: c, border: `2.5px solid ${color === c ? 'var(--s800)' : 'transparent'}`, boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none', transition: 'all .15s', cursor: 'pointer', flexShrink: 0 }}
              />
            ))}
            {color !== '#14b8a6' && (
              <button onClick={() => { setColor('#14b8a6'); saveAccentColor('#14b8a6', user?.user_id); }} style={{ fontSize: 11.5, color: 'var(--s400)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Restablecer
              </button>
            )}
          </div>
        </FieldRow>
        <FieldRow label="Avatar / foto de perfil" sub="Disponible próximamente — almacenamiento de archivos en desarrollo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 99, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {ini}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button disabled style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--s200)', background: 'var(--s50)', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, color: 'var(--s400)', cursor: 'not-allowed', opacity: 0.6 }}>
                <Upload size={13} />Subir foto
              </button>
              <span style={{ fontSize: 11, color: 'var(--s400)' }}>Próximamente</span>
            </div>
          </div>
        </FieldRow>
      </SectionCard>

      {/* Account info (read-only) */}
      <SectionCard title="Cuenta y permisos" icon={Shield}>
        <div style={{ padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--s100)' }}>
            <span style={{ fontSize: 13, color: 'var(--s500)' }}>ID de usuario</span>
            <span style={{ fontSize: 12, color: 'var(--s600)', fontFamily: "'DM Mono', monospace" }}>{user?.user_id ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--s100)' }}>
            <span style={{ fontSize: 13, color: 'var(--s500)' }}>Organización</span>
            <span style={{ fontSize: 12, color: 'var(--s600)', fontFamily: "'DM Mono', monospace" }}>{user?.org_id ?? '—'}</span>
          </div>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--s100)' }}>
            <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 8 }}>Roles activos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {user?.roles.map(role => {
                const cfg = ROLE_COLORS[role] ?? { color: 'var(--s600)', bg: 'var(--s100)' };
                return <Badge key={role} label={role.replace('_', ' ')} color={cfg.color} bg={cfg.bg} />;
              })}
            </div>
          </div>
          <div style={{ padding: '10px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 8 }}>Permisos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(user?.permissions ?? []).sort().map(p => (
                <span key={p} style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 8px', background: 'var(--s100)', color: 'var(--s600)', borderRadius: 5, fontFamily: "'DM Mono', monospace" }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Sesión" icon={LogOut} color="#ef4444">
        <div style={{ padding: '14px 0' }}>
          <button
            onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#fef2f2', color: '#ef4444', border: '1.5px solid #fecaca', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            <LogOut size={15} />Cerrar sesión
          </button>
        </div>
      </SectionCard>
    </>
  );
}

// ── Schedule section ──────────────────────────────────────────────────────────

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS   = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

function ScheduleSection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const mark = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  const savedSched = (() => { try { return JSON.parse(localStorage.getItem('sghcp_schedule') ?? '{}'); } catch { return {}; } })();
  const [activeDays,  setActiveDays]  = useState<string[]>(savedSched.activeDays ?? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']);
  const [startHour,   setStartHour]   = useState(savedSched.startHour ?? '08:00');
  const [endHour,     setEndHour]     = useState(savedSched.endHour ?? '19:00');
  const [sessionDur,  setSessionDur]  = useState(savedSched.sessionLen ?? 50);
  const [breakStart,  setBreakStart]  = useState('13:00');
  const [breakEnd,    setBreakEnd]    = useState('14:00');
  const [buffer,      setBuffer]      = useState(10);
  const [maxPerDay,   setMaxPerDay]   = useState(8);
  const [autoConfirm, setAutoConfirm] = useState(true);

  const toggleDay = (d: string) => {
    setActiveDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
    setDirty(true);
  };

  return (
    <>
      <SectionCard title="Días de atención" icon={CalendarDays}>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {DAYS_ES.map(d => {
              const on = activeDays.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  style={{ width: 46, height: 46, borderRadius: 10, border: `1.5px solid ${on ? 'var(--teal)' : 'var(--s200)'}`, background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--s500)', fontSize: 13, fontWeight: on ? 700 : 400, transition: 'all .12s', cursor: 'pointer' }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Horario de consulta" icon={Clock}>
        <FieldRow label="Hora de inicio">
          <FSelect value={startHour} onChange={mark(setStartHour)}>
            {HOURS.map(h => <option key={h}>{h}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Hora de fin">
          <FSelect value={endHour} onChange={mark(setEndHour)}>
            {HOURS.map(h => <option key={h}>{h}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Duración por defecto de sesión" sub="Se aplica al crear nueva cita">
          <div style={{ display: 'flex', gap: 7 }}>
            {[30, 45, 50, 60, 90].map(d => (
              <ChipBtn key={d} active={sessionDur === d} onClick={() => { setSessionDur(d); setDirty(true); }}>
                {d}m
              </ChipBtn>
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Pausa del mediodía">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <FSelect value={breakStart} onChange={mark(setBreakStart)}>
              {HOURS.map(h => <option key={h}>{h}</option>)}
            </FSelect>
            <span style={{ color: 'var(--s400)', fontSize: 13, flexShrink: 0 }}>a</span>
            <FSelect value={breakEnd} onChange={mark(setBreakEnd)}>
              {HOURS.map(h => <option key={h}>{h}</option>)}
            </FSelect>
          </div>
        </FieldRow>
        <FieldRow label="Buffer entre citas" sub="Tiempo libre mínimo entre sesiones">
          <div style={{ display: 'flex', gap: 7 }}>
            {[0, 5, 10, 15, 20].map(b => (
              <ChipBtn key={b} active={buffer === b} onClick={() => { setBuffer(b); setDirty(true); }}>
                {b}m
              </ChipBtn>
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Máximo de citas por día">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={1} max={15} value={maxPerDay}
              onChange={e => { setMaxPerDay(+e.target.value); setDirty(true); }}
              style={{ flex: 1, accentColor: 'var(--teal)' } as React.CSSProperties}
            />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: 'var(--teal)', minWidth: 24, textAlign: 'center' }}>{maxPerDay}</span>
          </div>
        </FieldRow>
        <Toggle
          value={autoConfirm}
          onChange={v => { setAutoConfirm(v); setDirty(true); }}
          label="Confirmar citas automáticamente"
          sub="Las nuevas citas quedan en estado 'Confirmada' sin acción manual"
        />
      </SectionCard>
    </>
  );
}

// ── Notifications section ─────────────────────────────────────────────────────

function NotificationsSection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const tog = (fn: (v: boolean) => void) => (v: boolean) => { fn(v); setDirty(true); };

  const [emailCh,     setEmailCh]     = useState(true);
  const [whatsapp,    setWhatsapp]    = useState(true);
  const [sms,         setSms]         = useState(false);
  const [remindH,     setRemindH]     = useState(24);
  const [remind24,    setRemind24]    = useState(true);
  const [remind2,     setRemind2]     = useState(false);
  const [newPat,      setNewPat]      = useState(true);
  const [cancelAlert, setCancelAlert] = useState(true);
  const [weekSummary, setWeekSummary] = useState(true);
  const [aiReady,     setAiReady]     = useState(true);

  return (
    <>
      <SectionCard title="Canales de notificación" icon={Send}>
        <Toggle value={emailCh}  onChange={tog(setEmailCh)}  label="Correo electrónico"   sub="Confirmaciones, recordatorios y resúmenes semanales" />
        <Toggle value={whatsapp} onChange={tog(setWhatsapp)} label="WhatsApp"             sub="Recordatorios automáticos y alertas urgentes" />
        <Toggle value={sms}      onChange={tog(setSms)}      label="SMS"                  sub="Respaldo cuando WhatsApp no está disponible" />
      </SectionCard>

      <SectionCard title="Recordatorios a pacientes" icon={Bell}>
        <FieldRow label="Anticipación del recordatorio" sub="¿Con cuánta antelación se envía?">
          <div style={{ display: 'flex', gap: 7 }}>
            {[2, 12, 24, 48].map(h => (
              <ChipBtn key={h} active={remindH === h} onClick={() => { setRemindH(h); setDirty(true); }}>
                {h}h
              </ChipBtn>
            ))}
          </div>
        </FieldRow>
        <Toggle value={remind24} onChange={tog(setRemind24)} label="Recordatorio 24h antes"  sub="Mensaje automático al paciente el día previo" />
        <Toggle value={remind2}  onChange={tog(setRemind2)}  label="Recordatorio 2h antes"   sub="Segunda notificación cercana a la cita" />
      </SectionCard>

      <SectionCard title="Alertas internas" icon={AlertCircle}>
        <Toggle value={newPat}      onChange={tog(setNewPat)}      label="Nuevo paciente registrado"      sub="Notificación cuando se crea un expediente" />
        <Toggle value={cancelAlert} onChange={tog(setCancelAlert)} label="Cancelación de cita"            sub="Alerta inmediata cuando un paciente cancela" />
        <Toggle value={weekSummary} onChange={tog(setWeekSummary)} label="Resumen semanal"                sub="Reporte cada lunes con métricas de la semana anterior" />
        <Toggle value={aiReady}     onChange={tog(setAiReady)}     label="Borrador IA listo para revisar" sub="Notificación cuando el sistema genera un nuevo borrador clínico" />
      </SectionCard>
    </>
  );
}

// ── AI section ────────────────────────────────────────────────────────────────

const NOTE_STYLES = [
  { id: 'structured', label: 'Estructurado', desc: 'Técnico-clínico estándar' },
  { id: 'narrative',  label: 'Narrativo',    desc: 'Redacción fluida'         },
  { id: 'bullet',     label: 'Con viñetas',  desc: 'Puntos concisos'          },
];

function AISection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const tog = (fn: (v: boolean) => void) => (v: boolean) => { fn(v); setDirty(true); };
  const mrk = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  const savedAI = (() => { try { return JSON.parse(localStorage.getItem('sghcp_ai_prefs') ?? '{}'); } catch { return {}; } })();
  const [enabled,    setEnabled]    = useState(savedAI.aiEnabled ?? true);
  const [autoGen,    setAutoGen]    = useState(true);
  const [confidence, setConfidence] = useState(85);
  const [style,      setStyle]      = useState(savedAI.soapStyle ?? 'structured');
  const [tone,       setTone]       = useState('formal');
  const [lang,       setLang]       = useState('es');
  const [auditLog,   setAuditLog]   = useState(true);
  const [dataRetain, setDataRetain] = useState('90');

  return (
    <>
      <SectionCard title="Asistente IA de redacción" icon={Sparkles} color="#f59e0b">
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#fffbeb', borderRadius: 11, border: '1.5px solid #fde68a' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={20} color="#f59e0b" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#78350f' }}>SGHCP-IA v2.1</div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>Genera borradores de nota clínica desde el audio de sesión. Requiere aprobación del profesional.</div>
            </div>
            <button
              onClick={() => { setEnabled((v: boolean) => !v); setDirty(true); }}
              style={{ width: 44, height: 26, borderRadius: 99, border: 'none', background: enabled ? 'var(--teal)' : 'var(--s200)', position: 'relative', transition: 'background .2s', cursor: 'pointer', flexShrink: 0 }}
            >
              <div style={{ position: 'absolute', top: 3, left: enabled ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
            </button>
          </div>
        </div>
        <Toggle value={autoGen} onChange={tog(setAutoGen)} label="Generación automática post-sesión" sub="El borrador se crea en segundo plano al terminar la consulta" disabled={!enabled} />
        <FieldRow label="Umbral mínimo de confianza" sub="El sistema sólo muestra borradores por encima de este umbral">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: enabled ? 1 : 0.5 }}>
            <input
              type="range" min={50} max={99} value={confidence}
              onChange={e => { setConfidence(+e.target.value); setDirty(true); }}
              disabled={!enabled}
              style={{ flex: 1, accentColor: '#f59e0b' } as React.CSSProperties}
            />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: '#f59e0b', minWidth: 40 }}>{confidence}%</span>
          </div>
        </FieldRow>
      </SectionCard>

      <SectionCard title="Estilo y tono de los borradores" icon={PenLine} color="#f59e0b">
        <FieldRow label="Formato de nota" sub="Cómo estructura el texto la IA">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, opacity: enabled ? 1 : 0.5 }}>
            {NOTE_STYLES.map(opt => {
              const sel = style === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => { setStyle(opt.id); setDirty(true); }}
                  disabled={!enabled}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 9, border: `1.5px solid ${sel ? 'var(--teal)' : 'var(--s200)'}`, background: sel ? 'var(--teal-l)' : '#fff', textAlign: 'left', transition: 'all .12s', cursor: enabled ? 'pointer' : 'not-allowed' }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 99, border: `2px solid ${sel ? 'var(--teal)' : 'var(--s300)'}`, background: sel ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <div style={{ width: 7, height: 7, borderRadius: 99, background: '#fff' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: sel ? 700 : 500, color: sel ? 'var(--teal-d)' : 'var(--s800)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 1 }}>{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </FieldRow>
        <FieldRow label="Tono del lenguaje">
          <FSelect value={tone} onChange={mrk(setTone)}>
            <option value="formal">Formal y técnico</option>
            <option value="neutral">Neutro</option>
            <option value="plain">Simple y directo</option>
          </FSelect>
        </FieldRow>
        <FieldRow label="Idioma de los borradores">
          <FSelect value={lang} onChange={mrk(setLang)}>
            <option value="es">Español (Colombia)</option>
            <option value="es_mx">Español (México)</option>
            <option value="es_es">Español (España)</option>
            <option value="en">English</option>
          </FSelect>
        </FieldRow>
      </SectionCard>

      <SectionCard title="Privacidad y auditoría IA" icon={ShieldCheck} color="#f59e0b">
        <Toggle value={auditLog} onChange={tog(setAuditLog)} label="Registro de auditoría IA" sub="Guarda quién revisó y aprobó cada borrador generado" />
        <FieldRow label="Retención de borradores pendientes" sub="Los borradores no aprobados se eliminan automáticamente">
          <FSelect value={dataRetain} onChange={mrk(setDataRetain)}>
            <option value="30">30 días</option>
            <option value="60">60 días</option>
            <option value="90">90 días</option>
            <option value="180">6 meses</option>
          </FSelect>
        </FieldRow>
      </SectionCard>
    </>
  );
}

// ── Security section ──────────────────────────────────────────────────────────

const ACTIVE_SESSIONS = [
  { device: 'MacBook Pro — Chrome',   icon: Monitor,    location: 'Bogotá, CO', time: 'Ahora',    current: true  },
  { device: 'iPhone 14 — Safari',     icon: Smartphone, location: 'Bogotá, CO', time: 'Hace 2h',  current: false },
  { device: 'iPad — Safari',          icon: Tablet,     location: 'Bogotá, CO', time: 'Hace 3d',  current: false },
];

function SecuritySection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const { user } = useAuth();
  const tog = (fn: (v: boolean) => void) => (v: boolean) => { fn(v); setDirty(true); };

  const [autoLock,    setAutoLock]    = useState(true);
  const [lockMin,     setLockMin]     = useState(5);
  const [twoFactor,   setTwoFactor]   = useState(false);
  const [sessionLog,  setSessionLog]  = useState(true);
  const [pin,         setPin]         = useState('');
  const [pin2,        setPin2]        = useState('');
  const [pinErr,      setPinErr]      = useState('');
  const [pinSaved,    setPinSaved]    = useState(false);

  const handlePinSave = () => {
    if (pin.length !== 4 || pin !== pin2) { setPinErr('Los PINs no coinciden o son muy cortos'); return; }
    setPinErr('');
    if (user?.user_id) localStorage.setItem(`sghcp_pin_${user.user_id}`, pin);
    setPinSaved(true);
    setDirty(true);
    setTimeout(() => setPinSaved(false), 2500);
    setPin(''); setPin2('');
  };

  return (
    <>
      <SectionCard title="Bloqueo de pantalla" icon={Lock} color="#ef4444">
        <Toggle value={autoLock} onChange={tog(setAutoLock)} label="Bloqueo automático por inactividad" sub="Protege la pantalla cuando no hay actividad" />
        <FieldRow label="Tiempo hasta bloqueo" sub="Minutos de inactividad antes del bloqueo">
          <div style={{ display: 'flex', gap: 7, opacity: autoLock ? 1 : 0.5 }}>
            {[2, 5, 10, 15, 30].map(m => (
              <ChipBtn key={m} active={lockMin === m} color="#ef4444" onClick={() => { if (autoLock) { setLockMin(m); setDirty(true); } }}>
                {m}m
              </ChipBtn>
            ))}
          </div>
        </FieldRow>

        {/* PIN change */}
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--s800)', marginBottom: 12 }}>Cambiar PIN de bloqueo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            {[
              { label: 'Nuevo PIN (4 dígitos)', val: pin, set: setPin },
              { label: 'Confirmar PIN',         val: pin2, set: setPin2 },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6 }}>{label}</div>
                <input
                  type="password"
                  maxLength={4}
                  value={val}
                  onChange={e => { set(e.target.value.replace(/\D/g, '')); setPinErr(''); }}
                  placeholder="••••"
                  style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${pinErr ? '#ef4444' : 'var(--s200)'}`, borderRadius: 9, fontSize: 18, letterSpacing: 6, textAlign: 'center', color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}
                  onFocus={e => (e.target.style.borderColor = '#ef4444')}
                  onBlur={e => (e.target.style.borderColor = pinErr ? '#ef4444' : 'var(--s200)')}
                />
              </div>
            ))}
          </div>
          {pinErr && (
            <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertCircle size={12} color="#ef4444" />{pinErr}
            </div>
          )}
          {pinSaved && (
            <div style={{ fontSize: 12, color: '#10b981', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle size={12} color="#10b981" />PIN actualizado correctamente
            </div>
          )}
          <button
            onClick={handlePinSave}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Key size={13} />Actualizar PIN
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Acceso y autenticación" icon={ShieldCheck} color="#ef4444">
        <Toggle value={twoFactor}  onChange={tog(setTwoFactor)}  label="Autenticación de dos factores (2FA)" sub="Requiere código OTP al iniciar sesión desde un dispositivo nuevo" />
        <Toggle value={sessionLog} onChange={tog(setSessionLog)} label="Registro de sesiones activas"        sub="Muestra qué dispositivos tienen sesión abierta" />
      </SectionCard>

      <SectionCard title="Sesiones activas" icon={Monitor} color="#ef4444">
        {ACTIVE_SESSIONS.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < ACTIVE_SESSIONS.length - 1 ? '1px solid var(--s100)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: s.current ? 'var(--teal-l)' : 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <s.icon size={16} color={s.current ? 'var(--teal)' : 'var(--s400)'} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--s800)', display: 'flex', alignItems: 'center', gap: 7 }}>
                {s.device}
                {s.current && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-l)', borderRadius: 5, padding: '1px 7px' }}>Actual</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 1 }}>{s.location} · {s.time}</div>
            </div>
            {!s.current && (
              <button
                style={{ fontSize: 12, color: '#ef4444', border: '1.5px solid #fecaca', background: '#fff', borderRadius: 7, padding: '5px 11px', fontWeight: 600, transition: 'background .12s', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
              >
                Cerrar sesión
              </button>
            )}
          </div>
        ))}
      </SectionCard>
    </>
  );
}

// ── Plan section ──────────────────────────────────────────────────────────────

function BillingSection() {
  const FEATURES = [
    { icon: Users,       label: 'Pacientes ilimitados' },
    { icon: Sparkles,    label: 'IA incluida'          },
    { icon: ShieldCheck, label: 'Firma digital legal'  },
  ];
  const USAGE = [
    { label: 'Pacientes activos',         used: 42,  max: null, unit: '',   color: 'var(--teal)'  },
    { label: 'Almacenamiento',            used: 2.3, max: 50,   unit: 'GB', color: '#6366f1'      },
    { label: 'Firmas digitales este mes', used: 18,  max: null, unit: '',   color: '#f59e0b'      },
  ];

  return (
    <SectionCard title="Plan actual" icon={CreditCard} color="#10b981">
      <div style={{ padding: '14px 0' }}>
        {/* Plan card */}
        <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg,#f0fdfa,#ecfdf5)', borderRadius: 14, border: '1.5px solid #6ee7b7', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <Star size={22} color="#10b981" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--s800)' }}>Plan Profesional</div>
              <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 2 }}>Renovación: abr 2027 · Anual</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: '#10b981', letterSpacing: '-0.5px' }}>$129.900</div>
              <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>COP/mes</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--teal-d)', fontWeight: 500 }}>
                <f.icon size={13} color="#10b981" />{f.label}
              </div>
            ))}
          </div>
        </div>

        {/* Usage */}
        {USAGE.map(u => (
          <div key={u.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--s100)' }}>
            <span style={{ fontSize: 13.5, color: 'var(--s600)', flex: 1 }}>{u.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {u.max && (
                <div style={{ width: 80, height: 5, borderRadius: 99, background: 'var(--s100)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(u.used / u.max) * 100}%`, background: u.color, borderRadius: 99 }} />
                </div>
              )}
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: 'var(--s800)' }}>
                {u.used}{u.unit}{u.max ? ` / ${u.max}${u.unit}` : ''}
              </span>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button
            style={{ flex: 1, padding: 10, borderRadius: 10, border: '1.5px solid #6ee7b7', background: '#fff', color: '#065f46', fontSize: 13.5, fontWeight: 600, transition: 'background .12s', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
          >
            Ver historial de facturación
          </button>
          <button style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontSize: 13.5, fontWeight: 700, boxShadow: '0 2px 8px rgba(16,185,129,.3)', cursor: 'pointer' }}>
            Cambiar plan
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Consent templates section (real API, versioned) ──────────────────────────

const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  TREATMENT: 'Tratamiento',
  RECORDING: 'Grabación de sesiones',
  DATA_PROCESSING: 'Tratamiento de datos',
  INFORMATION_SHARING: 'Compartir información',
};

function ConsentTemplatesSection() {
  const queryClient = useQueryClient();
  const [editingType, setEditingType] = useState<ConsentType | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedType, setSavedType] = useState<ConsentType | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['consent-templates'],
    queryFn: consentTemplatesApi.list,
  });
  const templates = data?.items ?? [];

  const startEdit = (type: ConsentType) => {
    const t = templates.find(x => x.consent_type === type);
    setEditingType(type);
    setTitle(t?.title ?? '');
    setBody(t?.body ?? '');
    setError('');
  };

  const handleSave = async () => {
    if (!editingType || !title.trim() || !body.trim()) return;
    setSaving(true);
    setError('');
    try {
      await consentTemplatesApi.update(editingType, { title: title.trim(), body: body.trim() });
      await queryClient.invalidateQueries({ queryKey: ['consent-templates'] });
      setSavedType(editingType);
      setEditingType(null);
      setTimeout(() => setSavedType(null), 5000);
    } catch {
      setError('No se pudo guardar la plantilla. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Plantillas de consentimiento" icon={ShieldCheck} color="#0d9488">
      <p style={{ margin: '12px 0 4px', fontSize: 12.5, color: 'var(--s400)', lineHeight: 1.6 }}>
        Editar crea una versión nueva. Los consentimientos ya firmados conservan el texto exacto que el paciente aceptó.
      </p>
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><Spinner size={20} color="var(--teal)" /></div>
      ) : (
        (Object.keys(CONSENT_TYPE_LABELS) as ConsentType[]).map(type => {
          const t = templates.find(x => x.consent_type === type);
          const isEditing = editingType === type;
          return (
            <div key={type} style={{ padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>
                    {t?.title ?? CONSENT_TYPE_LABELS[type]}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--s400)' }}>
                    {CONSENT_TYPE_LABELS[type]}{t ? ` · versión ${t.version}` : ' · sin plantilla'}
                    {savedType === type && <span style={{ color: '#059669', fontWeight: 600, marginLeft: 8 }}>✓ Versión nueva guardada</span>}
                  </p>
                </div>
                <button
                  onClick={() => isEditing ? setEditingType(null) : startEdit(type)}
                  style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s700)', cursor: 'pointer' }}
                >
                  {isEditing ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              {isEditing && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Título</label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }}
                  />
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Texto del documento</label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={10}
                    style={{ width: '100%', minHeight: 220, padding: '12px 14px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--red)' }}>{error}</p>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      onClick={handleSave}
                      disabled={saving || !title.trim() || !body.trim()}
                      style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !title.trim() || !body.trim() ? 0.6 : 1 }}
                    >
                      {saving ? 'Guardando…' : 'Guardar versión nueva'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </SectionCard>
  );
}

// ── Templates section ─────────────────────────────────────────────────────────

interface Template { id: number; name: string; type: string; default: boolean; content: string; }

function TemplatesSection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const [templates, setTemplates] = useState<Template[]>([
    { id: 2, name: 'Sesión inicial',    type: 'Anamnesis', default: true,  content: 'Motivo de consulta:\nAntecedentes:\nHistoria familiar:\nObservaciones:' },
    { id: 3, name: 'Alta terapéutica', type: 'Cierre',    default: false, content: 'Resumen del proceso:\nLogros alcanzados:\nRecomendaciones:\nSeguimiento:' },
  ]);
  const [editing, setEditing] = useState<number | null>(null);
  const [contents, setContents] = useState<Record<number, string>>({});

  const handleContentChange = (id: number, val: string) => {
    setContents(p => ({ ...p, [id]: val }));
    setDirty(true);
  };

  const handleDelete = (id: number) => {
    setTemplates(p => p.filter(t => t.id !== id));
    setDirty(true);
  };

  return (
    <SectionCard title="Plantillas de notas clínicas" icon={FileText} color="#8b5cf6">
      <div style={{ padding: '14px 0' }}>
        {templates.map(t => (
          <div key={t.id}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--s200)', marginBottom: 8, background: '#fff', transition: 'all .12s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={15} color="#8b5cf6" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--s800)' }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: '#8b5cf6', background: '#f5f3ff', borderRadius: 5, padding: '1px 7px' }}>{t.type}</span>
                  {t.default && <span style={{ fontSize: 11, color: '#10b981', background: '#ecfdf5', borderRadius: 5, padding: '1px 7px' }}>Por defecto</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setEditing(editing === t.id ? null : t.id)}
                  style={{ border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 7, padding: '5px 11px', fontSize: 12, color: 'var(--s600)', transition: 'all .12s', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.color = '#8b5cf6'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.color = 'var(--s600)'; }}
                >
                  {editing === t.id ? 'Cerrar' : 'Editar'}
                </button>
                {!t.default && (
                  <button
                    onClick={() => handleDelete(t.id)}
                    style={{ border: '1.5px solid #fecaca', background: '#fff', borderRadius: 7, padding: '5px 8px', color: '#ef4444', display: 'flex', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                )}
              </div>
            </div>
            {editing === t.id && (
              <div style={{ padding: '12px 14px', background: 'var(--s50)', borderRadius: 10, border: '1px solid var(--s200)', marginBottom: 8 }}>
                <textarea
                  rows={5}
                  value={contents[t.id] ?? t.content}
                  onChange={e => handleContentChange(t.id, e.target.value)}
                  style={{ width: '100%', border: '1.5px solid var(--s200)', borderRadius: 9, padding: '10px 13px', fontSize: 13, lineHeight: 1.7, color: 'var(--s800)', fontFamily: "'DM Mono', monospace", resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = '#8b5cf6')}
                  onBlur={e => (e.target.style.borderColor = 'var(--s200)')}
                />
              </div>
            )}
          </div>
        ))}
        <button
          style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1.5px dashed var(--s300)', background: 'transparent', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--s500)', width: '100%', justifyContent: 'center', transition: 'all .12s', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.color = '#8b5cf6'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s300)'; e.currentTarget.style.color = 'var(--s500)'; }}
        >
          <Plus size={15} />Nueva plantilla
        </button>
      </div>
    </SectionCard>
  );
}

// ── Integrations section ──────────────────────────────────────────────────────

const INTEGRATIONS = [
  { name: 'Google Calendar',   icon: CalendarDays,   color: '#4285F4', connected: false, desc: 'Sincroniza citas automáticamente con tu calendario de Google.' },
  { name: 'Zoom',              icon: Video,          color: '#2D8CFF', connected: false, desc: 'Genera links de videollamada automáticos al agendar citas virtuales.' },
  { name: 'WhatsApp Business', icon: MessageCircle,  color: '#25D366', connected: false, desc: 'Envía recordatorios y confirmaciones directamente por WhatsApp.' },
  { name: 'Stripe',            icon: CreditCard,     color: '#635BFF', connected: false, desc: 'Recibe pagos en línea y gestiona suscripciones de pacientes.' },
  { name: 'Minsalud / RIPS',   icon: Shield,         color: '#ef4444', connected: false, desc: 'Genera reportes RIPS y valida cobertura de seguros.' },
  { name: 'Google Drive',      icon: HardDrive,      color: '#0F9D58', connected: false, desc: 'Sube automáticamente los registros firmados a tu Drive.' },
];

function IntegrationsSection() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  return (
    <SectionCard title="Integraciones y servicios externos" icon={Plug} color="#6366f1">
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {INTEGRATIONS.map(integ => {
            const isConn = connected[integ.name] ?? integ.connected;
            return (
              <div
                key={integ.name}
                style={{ padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${isConn ? integ.color + '44' : 'var(--s200)'}`, background: isConn ? integ.color + '06' : '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: integ.color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <integ.icon size={17} color={integ.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--s800)' }}>{integ.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 2, lineHeight: 1.5 }}>{integ.desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => setConnected(p => ({ ...p, [integ.name]: !isConn }))}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: `1.5px solid ${isConn ? integ.color : 'var(--s200)'}`, background: isConn ? integ.color + '12' : '#fff', color: isConn ? integ.color : 'var(--s600)', fontSize: 12.5, fontWeight: 600, transition: 'all .12s', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isConn ? integ.color + '22' : integ.color + '08'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isConn ? integ.color + '12' : '#fff'; }}
                >
                  {isConn ? <CheckCircle size={12} color={integ.color} /> : <Plug size={12} color="var(--s400)" />}
                  {isConn ? 'Conectado' : 'Conectar'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

// ── Users section ────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'PROFESSIONAL',  label: 'Psicólogo/a profesional' },
  { value: 'INTERN',        label: 'Practicante supervisado' },
  { value: 'RECEPTIONIST',  label: 'Recepcionista' },
];

function UsersSection() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('CLINIC_ADMIN') ?? false;
  const [roleName,     setRoleName]     = useState('PROFESSIONAL');
  const [inviteCode,   setInviteCode]   = useState('');
  const [inviteExp,    setInviteExp]    = useState('');
  const [inviteLoading,setInviteLoading]= useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const [resetEmail,   setResetEmail]   = useState('');
  const [resetPwd,     setResetPwd]     = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone,    setResetDone]    = useState(false);
  const [resetErr,     setResetErr]     = useState('');

  const handleGenerateInvite = async () => {
    setInviteLoading(true); setInviteCode(''); setInviteCopied(false);
    try {
      const { authApi } = await import('@/api/auth');
      const res = await authApi.invite(roleName);
      setInviteCode(res.invite_code);
      setInviteExp(new Date(res.expires_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }));
    } catch {
      setInviteCode('ERROR');
    } finally {
      setInviteLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErr(''); setResetDone(false); setResetLoading(true);
    try {
      const { authApi } = await import('@/api/auth');
      await authApi.resetPassword(resetEmail.trim(), resetPwd);
      setResetDone(true); setResetEmail(''); setResetPwd('');
      setTimeout(() => setResetDone(false), 3000);
    } catch (err: unknown) {
      setResetErr(err instanceof Error ? err.message : 'Error al restablecer');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      <SectionCard title="Invitar nuevo usuario" icon={Plus} color="#0ea5e9">
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 14, lineHeight: 1.6 }}>
            Genera un código de invitación de un solo uso (válido 48 horas). El nuevo usuario lo ingresa en la pantalla de registro.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Rol a asignar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {ROLES.map(r => (
                <button key={r.value} onClick={() => setRoleName(r.value)} style={{
                  padding: '6px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all .12s',
                  border: `1.5px solid ${roleName === r.value ? '#0ea5e9' : 'var(--s200)'}`,
                  background: roleName === r.value ? '#e0f2fe' : '#fff',
                  color: roleName === r.value ? '#0369a1' : 'var(--s600)',
                }}>{r.label}</button>
              ))}
            </div>
          </div>
          <button onClick={handleGenerateInvite} disabled={inviteLoading} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
            background: inviteLoading ? 'var(--s200)' : '#0ea5e9', color: inviteLoading ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: inviteLoading ? 'not-allowed' : 'pointer', marginBottom: inviteCode ? 14 : 0,
          }}>
            {inviteLoading
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Generando…</>
              : <><Plus size={14} />Generar código de invitación</>}
          </button>

          {inviteCode && inviteCode !== 'ERROR' && (
            <div style={{ padding: '14px 16px', background: '#f0f9ff', border: '1.5px solid #7dd3fc', borderRadius: 11 }}>
              <div style={{ fontSize: 11.5, color: '#0369a1', fontWeight: 600, marginBottom: 6 }}>Código generado — expira el {inviteExp}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, letterSpacing: 6, color: '#0c4a6e', flex: 1 }}>
                  {inviteCode}
                </div>
                <button onClick={copyCode} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: `1.5px solid ${inviteCopied ? '#10b981' : '#7dd3fc'}`,
                  background: inviteCopied ? '#ecfdf5' : '#fff',
                  color: inviteCopied ? '#059669' : '#0369a1',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                }}>
                  {inviteCopied ? <><CheckCircle size={13} />Copiado</> : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {isAdmin && <SectionCard title="Restablecer contraseña" icon={Key} color="#ef4444">
        <form onSubmit={handleResetPassword} style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 14, lineHeight: 1.6 }}>
            Como administrador puedes restablecer la contraseña de cualquier usuario de tu organización.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Correo del usuario</div>
              <input value={resetEmail} onChange={e => setResetEmail(e.target.value)} type="email" required
                placeholder="usuario@clinica.co"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Nueva contraseña</div>
              <input value={resetPwd} onChange={e => setResetPwd(e.target.value)} type="password" required minLength={8}
                placeholder="Mínimo 8 caracteres"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          {resetErr && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{resetErr}</div>}
          {resetDone && <div style={{ fontSize: 12.5, color: '#10b981', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} />Contraseña restablecida correctamente.</div>}
          <button type="submit" disabled={resetLoading} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
            background: resetLoading ? 'var(--s200)' : '#ef4444', color: resetLoading ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: resetLoading ? 'not-allowed' : 'pointer',
          }}>
            {resetLoading
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Restableciendo…</>
              : <><Key size={14} />Restablecer contraseña</>}
          </button>
        </form>
      </SectionCard>}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [section, setSection] = useState<SectionId>('profile');
  const [dirty,   setDirty]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const handleSave = (doSave: boolean) => {
    if (!doSave) { setDirty(false); return; }
    setSaving(true);
    setTimeout(() => { setSaving(false); setDirty(false); setSaved(true); }, 1200);
    setTimeout(() => setSaved(false), 3000);
  };

  const markDirty = (v: boolean) => setDirty(v);
  const activeSection = SECTIONS.find(s => s.id === section)!;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }}>

      {/* ── Settings nav ────────────────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid var(--s200)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--s800)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={15} color="var(--teal)" />Configuración
          </div>
        </div>
        <nav style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
          {SECTIONS.map(item => {
            const on = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 9, border: 'none', background: on ? 'var(--teal-l)' : 'transparent', color: on ? 'var(--teal-d)' : 'var(--s600)', fontSize: 13.5, fontWeight: on ? 700 : 400, fontFamily: "'DM Sans', sans-serif", marginBottom: 2, textAlign: 'left', transition: 'all .12s', cursor: 'pointer' }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--s50)'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                <item.icon size={15} color={on ? 'var(--teal)' : 'var(--s400)'} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--s100)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>SGHCP v0.5.0 · 2026</div>
          <div style={{ fontSize: 11, color: 'var(--s300)', marginTop: 2 }}>Ley 1581/2012 · Res. 1995/1999</div>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Section topbar */}
        <div style={{ height: 52, flexShrink: 0, background: '#fff', borderBottom: '1px solid var(--s200)', display: 'flex', alignItems: 'center', padding: '0 28px', gap: 10 }}>
          <activeSection.icon size={16} color={activeSection.color ?? 'var(--teal)'} />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>{activeSection.label}</span>
          {dirty && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', background: '#fffbeb', borderRadius: 6, padding: '2px 8px', border: '1px solid #fde68a' }}>
              Cambios sin guardar
            </span>
          )}
          {saved && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#10b981', background: '#ecfdf5', borderRadius: 6, padding: '2px 8px', border: '1px solid #6ee7b7' }}>
              ✓ Guardado
            </span>
          )}
        </div>

        {/* Scrollable sections */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '24px 28px', maxWidth: 780 }}>
            {section === 'profile'       && <ProfileSection       setDirty={markDirty} />}
            {section === 'schedule'      && <ScheduleSection      setDirty={markDirty} />}
            {section === 'notifications' && <NotificationsSection setDirty={markDirty} />}
            {section === 'ai'            && <AISection            setDirty={markDirty} />}
            {section === 'security'      && <SecuritySection      setDirty={markDirty} />}
            {section === 'billing'       && <BillingSection />}
            {section === 'templates'     && <><ConsentTemplatesSection /><TemplatesSection setDirty={markDirty} /></>}
            {section === 'integrations'  && <IntegrationsSection />}
            {section === 'users'         && <UsersSection />}
          </div>
          <SaveBar dirty={dirty} saving={saving} saved={saved} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}
