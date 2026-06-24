import React, { useState, useEffect, useMemo } from 'react';
import {
  UserRound, Clock, Bell, Sparkles, ShieldCheck,
  FileText, Settings, CalendarDays, Send, AlertCircle,
  PenLine, Lock, Key, CheckCircle, Mail,
  Upload, Palette, Users, Trash2, Save,
  Shield, LogOut, Plus, Receipt, Pencil, X,
  MessageCircle, Calendar,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { authApi } from '@/api/auth';
import { adminApi } from '@/api/admin';
import { consentTemplatesApi, type ConsentType } from '@/api/clinicalRecords';
import { orgApi, type WhatsAppSettings } from '@/api/org';
import { gcalApi } from '@/api/gcal';
import { profilesApi, splitName, type Specialty } from '@/api/profiles';
import { serviceRatesApi, type ServiceRate, type RateModality } from '@/api/serviceRates';
import { ACCENT_COLORS, saveAccentColor } from '@/lib/theme';
import { loadSchedule, persistSchedule, fetchScheduleFromServer } from '@/lib/schedule';
import { useIsCompact } from '@/lib/useMediaQuery';
import { getLockConfig, setLockConfig } from '@/lib/screenLock';

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionId = 'profile' | 'schedule' | 'notifications' | 'ai' | 'security' | 'templates' | 'billing' | 'users';

const SECTIONS: { id: SectionId; icon: React.ElementType; label: string; color?: string; group: string }[] = [
  { id: 'profile',       icon: UserRound,  label: 'Perfil profesional',  group: 'Personal'     },
  { id: 'schedule',      icon: Clock,       label: 'Horario y agenda',    group: 'Personal'     },
  { id: 'security',      icon: ShieldCheck, label: 'Seguridad',            group: 'Personal',    color: '#ef4444' },
  { id: 'ai',            icon: Sparkles,    label: 'Asistente IA',         group: 'Herramientas',color: '#f59e0b' },
  { id: 'notifications', icon: Bell,        label: 'Notificaciones',       group: 'Herramientas' },
  { id: 'templates',     icon: FileText,    label: 'Plantillas clínicas',  group: 'Herramientas',color: '#8b5cf6' },
  { id: 'billing',       icon: Receipt,     label: 'Tarifas',              group: 'Equipo',      color: '#10b981' },
  { id: 'users',         icon: Users,       label: 'Usuarios',             group: 'Equipo',      color: '#0ea5e9' },
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
  const queryClient = useQueryClient();
  const mark = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  const savedProfile = (() => { try { return JSON.parse(localStorage.getItem('sghcp_profile') ?? '{}'); } catch { return {}; } })();
  // display_name from the JWT is the source of truth for the app UI.
  const [name,      setName]      = useState(user?.display_name || savedProfile.name || '');
  const [email,     setEmail]     = useState(user?.email ?? '');
  const savedAccent = localStorage.getItem(`sghcp_accent_${user?.user_id}`) ?? '#14b8a6';
  const [color,     setColor]     = useState(savedAccent);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveErr,   setSaveErr]   = useState('');

  // Professional profile — persisted in the backend (professional_profiles);
  // this is what signed clinical PDFs print (name + tarjeta profesional).
  const [nombres,     setNombres]     = useState('');
  const [apellidos,   setApellidos]   = useState('');
  const [license,     setLicense]     = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [phone,       setPhone]       = useState(savedProfile.phone ?? '');
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [signature,   setSignature]   = useState<string | null>(null);
  const [sigBusy,     setSigBusy]     = useState(false);
  const [sigErr,      setSigErr]      = useState('');
  const [avatar,      setAvatar]      = useState<string | null>(null);
  const [avatarBusy,  setAvatarBusy]  = useState(false);
  const [avatarErr,   setAvatarErr]   = useState('');

  useEffect(() => {
    profilesApi.specialties()
      .then(r => {
        setSpecialties(r.items);
        setSpecialtyId(prev => prev || (r.items.find(s => s.code === 'PSI_CLI')?.id ?? r.items[0]?.id ?? ''));
      })
      .catch(() => {});
    profilesApi.get()
      .then(p => {
        setNombres([p.first_name, p.middle_name].filter(Boolean).join(' '));
        setApellidos([p.paternal_last_name, p.maternal_last_name].filter(Boolean).join(' '));
        setLicense(p.license_number);
        setSpecialtyId(p.specialty_id);
        if (p.phone) setPhone(p.phone);
        setSignature(p.signature_png ?? null);
        setAvatar(p.avatar_png ?? null);
      })
      .catch(() => { /* 404 — no profile yet */ });
  }, []);

  const handleSignatureFile = (file: File | null) => {
    if (!file) return;
    setSigErr('');
    if (file.type !== 'image/png') { setSigErr('La firma debe ser una imagen PNG (idealmente con fondo transparente).'); return; }
    if (file.size > 500 * 1024) { setSigErr('La imagen no puede superar 500KB.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setSigBusy(true);
      try {
        await profilesApi.uploadSignature(dataUrl);
        setSignature(dataUrl);
      } catch {
        setSigErr('No se pudo guardar. Completa y guarda primero el perfil profesional.');
      } finally {
        setSigBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureDelete = async () => {
    setSigBusy(true); setSigErr('');
    try {
      await profilesApi.deleteSignature();
      setSignature(null);
    } catch {
      setSigErr('No se pudo eliminar la firma.');
    } finally {
      setSigBusy(false);
    }
  };

  // Downscale to a 256px square JPEG before upload — keeps the stored data URL
  // a few KB and avoids shipping a multi-MB phone photo to the server.
  const handleAvatarFile = (file: File | null) => {
    if (!file) return;
    setAvatarErr('');
    if (!file.type.startsWith('image/')) { setAvatarErr('Selecciona una imagen.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const SIZE = 256;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setAvatarErr('No se pudo procesar la imagen.'); return; }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarBusy(true);
        try {
          await profilesApi.uploadAvatar(dataUrl);
          setAvatar(dataUrl);
          queryClient.invalidateQueries({ queryKey: ['my-profile'] });
        } catch {
          setAvatarErr('No se pudo guardar. Completa y guarda primero el perfil profesional.');
        } finally {
          setAvatarBusy(false);
        }
      };
      img.onerror = () => setAvatarErr('No se pudo leer la imagen.');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarDelete = async () => {
    setAvatarBusy(true); setAvatarErr('');
    try {
      await profilesApi.deleteAvatar();
      setAvatar(null);
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    } catch {
      setAvatarErr('No se pudo eliminar la foto.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSaving(true); setSaveErr('');
    try {
      await updateProfile(name.trim());
      if (nombres.trim() && apellidos.trim() && license.trim() && specialtyId) {
        const [firstName, middleName] = splitName(nombres);
        const [paternal, maternal] = splitName(apellidos);
        await profilesApi.save({
          first_name: firstName,
          middle_name: middleName,
          paternal_last_name: paternal,
          maternal_last_name: maternal,
          license_number: license.trim(),
          specialty_id: specialtyId,
          phone: phone.trim(),
        });
      } else if (nombres.trim() || apellidos.trim() || license.trim()) {
        setSaveErr('Para guardar el perfil profesional completa nombres, apellidos, tarjeta profesional y especialidad.');
        setSaving(false);
        return;
      }
      localStorage.setItem('sghcp_profile', JSON.stringify({ ...savedProfile, name: name.trim(), phone }));
      // Refresh the sidebar's specialty label (sourced from the server profile).
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
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
        <FieldRow label="Nombre para mostrar" sub="Como apareces dentro de la aplicación">
          <FInput value={name} onChange={mark(setName)} placeholder="Dra. Nombre Apellido" />
        </FieldRow>
        <FieldRow label="Nombres" sub="Aparece en los documentos clínicos firmados">
          <FInput value={nombres} onChange={mark(setNombres)} placeholder="Ej: Marcela" />
        </FieldRow>
        <FieldRow label="Apellidos">
          <FInput value={apellidos} onChange={mark(setApellidos)} placeholder="Ej: Chapués Rodríguez" />
        </FieldRow>
        <FieldRow label="Tarjeta profesional" sub="Nº de registro expedido por Colpsic (Ley 1090/2006)">
          <FInput value={license} onChange={mark(setLicense)} placeholder="Ej: 123456" />
        </FieldRow>
        <FieldRow label="Especialidad">
          <FSelect value={specialtyId} onChange={mark(setSpecialtyId)}>
            {specialties.length === 0 && <option value="">Cargando catálogo…</option>}
            {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Correo electrónico">
          <FInput value={email} onChange={mark(setEmail)} type="email" />
        </FieldRow>
        <FieldRow label="Teléfono">
          <FInput value={phone} onChange={mark(setPhone)} type="tel" placeholder="+57 3XX XXX XXXX" />
        </FieldRow>
        <FieldRow label="Firma manuscrita" sub="Imagen PNG (fondo transparente, máx. 500KB). Se imprime automáticamente en los PDF de historia clínica.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {signature ? (
              <img src={signature} alt="Firma" style={{ height: 56, maxWidth: 220, objectFit: 'contain', border: '1px dashed var(--s200)', borderRadius: 8, padding: 6, background: '#fff' }} />
            ) : (
              <span style={{ fontSize: 12.5, color: 'var(--s400)' }}>Sin firma cargada — el PDF muestra solo la línea de firma.</span>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s700)', fontSize: 12.5, fontWeight: 600, cursor: sigBusy ? 'wait' : 'pointer' }}>
              <Upload size={13} /> {sigBusy ? 'Guardando…' : signature ? 'Reemplazar' : 'Cargar firma'}
              <input type="file" accept="image/png" style={{ display: 'none' }} disabled={sigBusy}
                onChange={e => { handleSignatureFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            </label>
            {signature && (
              <button onClick={handleSignatureDelete} disabled={sigBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#991b1b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                <Trash2 size={13} /> Quitar
              </button>
            )}
          </div>
          {sigErr && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--red)' }}>{sigErr}</p>}
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
              : <><Save size={13} />Guardar perfil</>}
          </button>
          {saved    && <span style={{ fontSize: 12.5, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={13} />Perfil actualizado</span>}
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
        <FieldRow label="Avatar / foto de perfil" sub="Se muestra en el menú lateral. Se recorta a un cuadrado y se reduce automáticamente.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {avatar
              ? <img src={avatar} alt="Avatar" style={{ width: 48, height: 48, borderRadius: 99, objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 48, height: 48, borderRadius: 99, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {ini}
                </div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, color: 'var(--s600)', cursor: avatarBusy ? 'wait' : 'pointer', fontWeight: 600 }}>
                  <Upload size={13} />{avatarBusy ? 'Subiendo…' : avatar ? 'Cambiar' : 'Subir foto'}
                  <input type="file" accept="image/*" disabled={avatarBusy} onChange={e => handleAvatarFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                </label>
                {avatar && (
                  <button onClick={handleAvatarDelete} disabled={avatarBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, border: 'none', background: '#fee2e2', color: '#991b1b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    <Trash2 size={13} /> Quitar
                  </button>
                )}
              </div>
              {avatarErr && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{avatarErr}</span>}
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
          <div style={{ padding: '10px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 8 }}>Roles activos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {user?.roles.map(role => {
                const cfg = ROLE_COLORS[role] ?? { color: 'var(--s600)', bg: 'var(--s100)' };
                return <Badge key={role} label={role.replace('_', ' ')} color={cfg.color} bg={cfg.bg} />;
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      <GoogleCalendarCard />

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

// ── Google Calendar card ──────────────────────────────────────────────────────

function GoogleCalendarCard() {
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

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS   = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

function ScheduleSection() {
  const queryClient = useQueryClient();
  const init = useMemo(() => loadSchedule(), []);
  const [activeDays,  setActiveDays]  = useState<string[]>(init.activeDays);
  const [startHour,   setStartHour]   = useState(init.startHour);
  const [endHour,     setEndHour]     = useState(init.endHour);
  const [sessionDur,  setSessionDur]  = useState(init.sessionLen);
  const [breakStart,  setBreakStart]  = useState(init.breakStart ?? '13:00');
  const [breakEnd,    setBreakEnd]    = useState(init.breakEnd ?? '14:00');
  const [buffer,      setBuffer]      = useState(init.buffer ?? 10);
  const [maxPerDay,   setMaxPerDay]   = useState(init.maxPerDay ?? 8);
  const [hydrated,    setHydrated]    = useState(false);

  // Server is the source of truth — hydrate once, then persist every change
  // (localStorage cache + PUT to the profile, so it follows her across devices).
  useEffect(() => {
    fetchScheduleFromServer().then(cfg => {
      if (cfg) {
        setActiveDays(cfg.activeDays);
        setStartHour(cfg.startHour);
        setEndHour(cfg.endHour);
        setSessionDur(cfg.sessionLen);
        setBreakStart(cfg.breakStart ?? '13:00');
        setBreakEnd(cfg.breakEnd ?? '14:00');
        setBuffer(cfg.buffer ?? 10);
        setMaxPerDay(cfg.maxPerDay ?? 8);
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't overwrite the server copy with stale cache on mount
    const t = setTimeout(() => {
      persistSchedule({ activeDays, startHour, endHour, sessionLen: sessionDur, breakStart, breakEnd, buffer, maxPerDay })
        // Refresh the scheduler's cached copy so the agenda reflects the new
        // hours without a manual reload.
        .then(() => queryClient.invalidateQueries({ queryKey: ['my-schedule'] }));
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated, activeDays, startHour, endHour, sessionDur, breakStart, breakEnd, buffer, maxPerDay, queryClient]);

  const toggleDay = (d: string) => {
    setActiveDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, fontSize: 12.5, color: 'var(--s500)' }}>
        <CheckCircle size={13} color="#10b981" />
        Los cambios se guardan automáticamente en tu perfil y definen los horarios disponibles al agendar citas en cualquier dispositivo.
      </div>
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
          <FSelect value={startHour} onChange={setStartHour}>
            {HOURS.map(h => <option key={h}>{h}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Hora de fin">
          <FSelect value={endHour} onChange={setEndHour}>
            {HOURS.map(h => <option key={h}>{h}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Duración por defecto de sesión" sub="Se aplica al crear nueva cita">
          <div style={{ display: 'flex', gap: 7 }}>
            {[30, 45, 50, 60, 90].map(d => (
              <ChipBtn key={d} active={sessionDur === d} onClick={() => setSessionDur(d)}>
                {d}m
              </ChipBtn>
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Pausa del mediodía" sub="No se ofrecen horarios dentro de la pausa">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <FSelect value={breakStart} onChange={setBreakStart}>
              {HOURS.map(h => <option key={h}>{h}</option>)}
            </FSelect>
            <span style={{ color: 'var(--s400)', fontSize: 13, flexShrink: 0 }}>a</span>
            <FSelect value={breakEnd} onChange={setBreakEnd}>
              {HOURS.map(h => <option key={h}>{h}</option>)}
            </FSelect>
          </div>
        </FieldRow>
        <FieldRow label="Buffer entre citas" sub="Tiempo libre mínimo entre sesiones">
          <div style={{ display: 'flex', gap: 7 }}>
            {[0, 5, 10, 15, 20].map(b => (
              <ChipBtn key={b} active={buffer === b} onClick={() => setBuffer(b)}>
                {b}m
              </ChipBtn>
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Máximo de citas por día" sub="Al superarlo, el agendador muestra una alerta de carga">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={1} max={15} value={maxPerDay}
              onChange={e => setMaxPerDay(+e.target.value)}
              style={{ flex: 1, accentColor: 'var(--teal)' } as React.CSSProperties}
            />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: 'var(--teal)', minWidth: 24, textAlign: 'center' }}>{maxPerDay}</span>
          </div>
        </FieldRow>
      </SectionCard>
    </>
  );
}

// ── Notifications section ─────────────────────────────────────────────────────

// A feature that isn't wired yet — shown so the roadmap is visible, but clearly
// marked "Próximamente" and non-interactive so nobody relies on it.
function SoonRow({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', opacity: 0.6 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--s700)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {label}
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--s500)', background: 'var(--s100)', border: '1px solid var(--s200)', borderRadius: 6, padding: '2px 7px' }}>Próximamente</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--s400)', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ width: 44, height: 26, borderRadius: 99, background: 'var(--s200)', flexShrink: 0 }} />
    </div>
  );
}

// Per-tenant WhatsApp config (Meta Cloud API). Proactive messages require
// Meta-approved templates, so the form collects the phone number id, a
// write-only System User token, and the approved template names per kind.
function WhatsAppCard({ setDirty }: { setDirty: (v: boolean) => void }) {
  const blank: WhatsAppSettings = {
    enabled: false, phone_number_id: '', waba_id: '',
    tpl_reminder_24h: '', tpl_reminder_2h: '', tpl_booking: '',
    lang: 'es', token_set: false,
  };
  const [s, setS] = useState<WhatsAppSettings>(blank);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    orgApi.getWhatsApp()
      .then(setS)
      .catch(() => { /* keep blank */ })
      .finally(() => setLoading(false));
  }, []);

  const upd = <K extends keyof WhatsAppSettings>(k: K, v: WhatsAppSettings[K]) => {
    setS(prev => ({ ...prev, [k]: v })); setDirty(true); setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const out = await orgApi.saveWhatsApp({
        enabled: s.enabled, phone_number_id: s.phone_number_id.trim(), waba_id: s.waba_id.trim(),
        tpl_reminder_24h: s.tpl_reminder_24h.trim(), tpl_reminder_2h: s.tpl_reminder_2h.trim(),
        tpl_booking: s.tpl_booking.trim(), lang: s.lang || 'es', access_token: token.trim(),
      });
      setS(out); setToken('');
      setSaved(true); setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* surfaced by the button staying enabled */ }
    finally { setSaving(false); }
  };

  return (
    <SectionCard title="WhatsApp (Meta Cloud API)" icon={MessageCircle}>
      <div style={{ fontSize: 13, color: 'var(--s500)', padding: '4px 0 8px', lineHeight: 1.6 }}>
        Envía recordatorios y confirmaciones por WhatsApp desde el número de tu clínica.
        Requiere una cuenta de WhatsApp Business verificada en Meta y plantillas de mensaje
        aprobadas; ingresa aquí sus nombres exactos.
      </div>
      <Toggle value={s.enabled} onChange={v => upd('enabled', v)} disabled={loading}
              label="Activar WhatsApp" sub="Usa las credenciales de abajo para enviar los mensajes" />
      <FieldRow label="Phone Number ID" sub="ID del número en Meta (no el número visible)">
        <FInput value={s.phone_number_id} onChange={v => upd('phone_number_id', v)} mono disabled={loading} placeholder="1234567890" />
      </FieldRow>
      <FieldRow label="WABA ID" sub="WhatsApp Business Account (opcional)">
        <FInput value={s.waba_id} onChange={v => upd('waba_id', v)} mono disabled={loading} placeholder="opcional" />
      </FieldRow>
      <FieldRow label="Access Token" sub={s.token_set ? 'Hay un token guardado — escribe uno nuevo para reemplazarlo' : 'Token de System User de Meta'}>
        <FInput value={token} onChange={setToken} type="password" mono disabled={loading}
                placeholder={s.token_set ? '•••••••• guardado' : 'EAAG…'} />
      </FieldRow>
      <FieldRow label="Plantilla recordatorio 24h" sub="Nombre de la plantilla aprobada">
        <FInput value={s.tpl_reminder_24h} onChange={v => upd('tpl_reminder_24h', v)} mono disabled={loading} placeholder="appointment_reminder" />
      </FieldRow>
      <FieldRow label="Plantilla recordatorio 2h" sub="Nombre de la plantilla aprobada">
        <FInput value={s.tpl_reminder_2h} onChange={v => upd('tpl_reminder_2h', v)} mono disabled={loading} placeholder="appointment_reminder_soon" />
      </FieldRow>
      <FieldRow label="Plantilla confirmación" sub="Se envía al confirmarse la cita">
        <FInput value={s.tpl_booking} onChange={v => upd('tpl_booking', v)} mono disabled={loading} placeholder="booking_confirmed" />
      </FieldRow>
      <FieldRow label="Idioma de las plantillas" sub="Código de idioma configurado en Meta">
        <FInput value={s.lang} onChange={v => upd('lang', v)} mono disabled={loading} placeholder="es" />
      </FieldRow>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
        <button onClick={save} disabled={saving || loading} style={{
          padding: '9px 18px', borderRadius: 9, border: 'none',
          background: saving || loading ? 'var(--s200)' : 'var(--teal)', color: saving || loading ? 'var(--s400)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: saving || loading ? 'not-allowed' : 'pointer',
        }}>{saving ? 'Guardando…' : 'Guardar WhatsApp'}</button>
        {saved && <span style={{ fontSize: 12.5, color: '#10b981', fontWeight: 600 }}>✓ Guardado</span>}
      </div>
    </SectionCard>
  );
}

function NotificationsSection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const [remind24, setRemind24] = useState(true);
  const [remind2,  setRemind2]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    orgApi.getNotifications()
      .then(s => { setRemind24(s.reminder_24h); setRemind2(s.reminder_2h); })
      .catch(() => { /* keep defaults */ })
      .finally(() => setLoading(false));
  }, []);

  const tog = (fn: (v: boolean) => void) => (v: boolean) => { fn(v); setDirty(true); setSaved(false); };

  const save = async () => {
    setSaving(true);
    try {
      await orgApi.saveNotifications({ reminder_24h: remind24, reminder_2h: remind2 });
      setSaved(true); setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* surfaced by the disabled state staying */ }
    finally { setSaving(false); }
  };

  return (
    <>
      <SectionCard title="Canales de notificación" icon={Send}>
        <Toggle value disabled onChange={() => {}} label="Correo electrónico" sub="Confirmaciones de cita y recordatorios — activo" />
        <SoonRow label="SMS" sub="Respaldo cuando WhatsApp no está disponible" />
      </SectionCard>

      <WhatsAppCard setDirty={setDirty} />

      <SectionCard title="Recordatorios a pacientes" icon={Bell}>
        <div style={{ fontSize: 13, color: 'var(--s500)', padding: '4px 0 8px', lineHeight: 1.6 }}>
          Se envían por correo al paciente antes de su cita. Reducen las inasistencias.
        </div>
        <Toggle value={remind24} onChange={tog(setRemind24)} disabled={loading} label="Recordatorio 24h antes" sub="Correo automático el día previo a la cita" />
        <Toggle value={remind2}  onChange={tog(setRemind2)}  disabled={loading} label="Recordatorio 2h antes"  sub="Segundo aviso cercano a la cita" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
          <button onClick={save} disabled={saving || loading} style={{
            padding: '9px 18px', borderRadius: 9, border: 'none',
            background: saving || loading ? 'var(--s200)' : 'var(--teal)', color: saving || loading ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: saving || loading ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Guardando…' : 'Guardar recordatorios'}</button>
          {saved && <span style={{ fontSize: 12.5, color: '#10b981', fontWeight: 600 }}>✓ Guardado</span>}
        </div>
      </SectionCard>

      <SectionCard title="Alertas internas" icon={AlertCircle}>
        <SoonRow label="Nuevo paciente registrado" sub="Notificación cuando se crea un expediente" />
        <SoonRow label="Cancelación de cita" sub="Alerta inmediata cuando un paciente cancela" />
        <SoonRow label="Resumen semanal" sub="Reporte cada lunes con métricas de la semana anterior" />
        <SoonRow label="Borrador IA listo para revisar" sub="Notificación cuando el sistema genera un nuevo borrador clínico" />
      </SectionCard>
    </>
  );
}

// ── AI section ────────────────────────────────────────────────────────────────

const NOTE_STYLES = [
  { id: 'structured', label: 'Estructurado', desc: 'Técnico-clínico estándar' },
  { id: 'narrative',  label: 'Narrativo',    desc: 'Redacción fluida'         },
];

function AISection({ setDirty, saveRef }: { setDirty: (v: boolean) => void; saveRef: React.MutableRefObject<(() => Promise<void>) | null> }) {
  const mrk = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  const [style,      setStyle]      = useState('structured');
  const [tone,       setTone]       = useState('formal');
  const [dataRetain, setDataRetain] = useState('180');

  useEffect(() => {
    profilesApi.getAIPrefs()
      .then(r => {
        if (r.ai_prefs.note_style)   setStyle(r.ai_prefs.note_style);
        if (r.ai_prefs.tone)         setTone(r.ai_prefs.tone);
        if ((r.ai_prefs as any).data_retain) setDataRetain((r.ai_prefs as any).data_retain);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    saveRef.current = async () => {
      await profilesApi.saveAIPrefs({ note_style: style, tone, data_retain: dataRetain } as any);
    };
    return () => { saveRef.current = null; };
  }, [style, tone, dataRetain, saveRef]);

  return (
    <>
      <SectionCard title="Asistente IA de redacción" icon={Sparkles} color="#f59e0b">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={20} color="#f59e0b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#78350f' }}>SGHCP-IA v2.1 · Activo</div>
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>Genera borradores de nota clínica desde el audio de sesión. El profesional aprueba explícitamente antes de incorporar al registro.</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Estilo y tono de los borradores" icon={PenLine} color="#f59e0b">
        <FieldRow label="Formato de nota" sub="Cómo estructura el texto la IA">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {NOTE_STYLES.map(opt => {
              const sel = style === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => { setStyle(opt.id); setDirty(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 9, border: `1.5px solid ${sel ? 'var(--teal)' : 'var(--s200)'}`, background: sel ? 'var(--teal-l)' : '#fff', textAlign: 'left', transition: 'all .12s', cursor: 'pointer' }}
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
      </SectionCard>

      <SectionCard title="Auditoría y retención" icon={ShieldCheck} color="#f59e0b">
        {/* Audit log is mandatory — Res. 1995/1999 & Ley 1581/2012 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--s800)' }}>Registro de auditoría IA</div>
            <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>Queda constancia de quién revisó y aprobó cada borrador. Obligatorio según Res. 1995/1999.</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#d1fae5', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>Siempre activo</span>
        </div>
        <FieldRow
          label="Retención de borradores no aprobados"
          sub="Borradores rechazados o sin revisar. La Res. 1995/1999 exige 15 años para la HC oficial; estos borradores no son HC, pero se recomienda ≥ 6 meses para auditoría interna."
        >
          <FSelect value={dataRetain} onChange={mrk(setDataRetain)}>
            <option value="180">6 meses (mínimo recomendado)</option>
            <option value="365">1 año</option>
            <option value="730">2 años</option>
          </FSelect>
        </FieldRow>
      </SectionCard>
    </>
  );
}

// ── Security section ──────────────────────────────────────────────────────────

function SecuritySection() {
  const { user } = useAuth();

  // Screen-lock config persists immediately to localStorage (device-local, like
  // the PIN) — it does NOT go through the global SaveBar, so no false "guardado".
  const [autoLock,    setAutoLock]    = useState(true);
  const [lockMin,     setLockMin]     = useState(5);
  const [lockSaved,   setLockSaved]   = useState(false);
  const [pin,         setPin]         = useState('');
  const [pin2,        setPin2]        = useState('');
  const [pinErr,      setPinErr]      = useState('');
  const [pinSaved,    setPinSaved]    = useState(false);

  const [curPwd,    setCurPwd]    = useState('');
  const [newPwd,    setNewPwd]    = useState('');
  const [newPwd2,   setNewPwd2]   = useState('');
  const [pwdErr,    setPwdErr]    = useState('');
  const [pwdSaved,  setPwdSaved]  = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);

  const [newEmail,      setNewEmail]      = useState('');
  const [emailErr,      setEmailErr]      = useState('');
  const [emailSaved,    setEmailSaved]    = useState('');
  const [emailSaving,   setEmailSaving]   = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr(''); setPwdSaved(false);
    if (newPwd.length < 8)   { setPwdErr('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    if (newPwd !== newPwd2)  { setPwdErr('Las contraseñas nuevas no coinciden.'); return; }
    setPwdSaving(true);
    try {
      await authApi.changePassword(curPwd, newPwd);
      setPwdSaved(true);
      setCurPwd(''); setNewPwd(''); setNewPwd2('');
      setTimeout(() => setPwdSaved(false), 4000);
    } catch {
      setPwdErr('No se pudo cambiar la contraseña. Verifica la contraseña actual.');
    } finally {
      setPwdSaving(false);
    }
  };

  // Load the device-local lock config on mount.
  useEffect(() => {
    const cfg = getLockConfig(user?.user_id);
    setAutoLock(cfg.enabled);
    setLockMin(cfg.minutes);
  }, [user?.user_id]);

  // Persist lock config immediately and flash an inline "guardado".
  const persistLock = (enabled: boolean, minutes: number) => {
    setLockConfig(user?.user_id, { enabled, minutes });
    setLockSaved(true);
    setTimeout(() => setLockSaved(false), 2000);
  };

  const handleAutoLockToggle = (v: boolean) => { setAutoLock(v); persistLock(v, lockMin); };
  const handleLockMin = (m: number) => { setLockMin(m); persistLock(autoLock, m); };

  const handlePinSave = () => {
    if (pin.length !== 4 || pin !== pin2) { setPinErr('Los PINs no coinciden o son muy cortos'); return; }
    setPinErr('');
    if (user?.user_id) localStorage.setItem(`sghcp_pin_${user.user_id}`, pin);
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2500);
    setPin(''); setPin2('');
  };

  return (
    <>
      <SectionCard title="Bloqueo de pantalla" icon={Lock} color="#ef4444">
        <Toggle value={autoLock} onChange={handleAutoLockToggle} label="Bloqueo automático por inactividad" sub="Bloquea la pantalla tras inactividad. Requiere un PIN configurado abajo." />
        <FieldRow label="Tiempo hasta bloqueo" sub="Minutos de inactividad antes del bloqueo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 7, opacity: autoLock ? 1 : 0.5 }}>
              {[2, 5, 10, 15, 30].map(m => (
                <ChipBtn key={m} active={lockMin === m} color="#ef4444" onClick={() => { if (autoLock) handleLockMin(m); }}>
                  {m}m
                </ChipBtn>
              ))}
            </div>
            {lockSaved && <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} />Guardado</span>}
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

      <SectionCard title="Cambiar contraseña" icon={Key} color="#ef4444">
        <form onSubmit={handlePasswordChange} style={{ padding: '14px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Contraseña actual</div>
              <input value={curPwd} onChange={e => setCurPwd(e.target.value)} type="password" required
                autoComplete="current-password"
                style={{ width: '100%', maxWidth: 340, padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Nueva contraseña</div>
              <input value={newPwd} onChange={e => setNewPwd(e.target.value)} type="password" required minLength={8}
                autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Confirmar nueva contraseña</div>
              <input value={newPwd2} onChange={e => setNewPwd2(e.target.value)} type="password" required minLength={8}
                autoComplete="new-password"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          {pwdErr && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{pwdErr}</div>}
          {pwdSaved && <div style={{ fontSize: 12.5, color: '#10b981', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} />Contraseña actualizada correctamente.</div>}
          <button type="submit" disabled={pwdSaving} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
            background: pwdSaving ? 'var(--s200)' : '#ef4444', color: pwdSaving ? 'var(--s400)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: pwdSaving ? 'not-allowed' : 'pointer',
          }}>
            {pwdSaving
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Cambiando…</>
              : <><Key size={14} />Cambiar contraseña</>}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Cambiar correo" icon={Mail} color="#0369a1">
        <form onSubmit={async e => {
          e.preventDefault();
          setEmailErr(''); setEmailSaved(''); setEmailSaving(true);
          try {
            await authApi.requestEmailChange(newEmail.trim());
            setEmailSaved(`Enviamos un enlace de confirmación a ${newEmail.trim()}. Haz clic en él para confirmar el cambio.`);
            setNewEmail('');
          } catch (ex) {
            setEmailErr(ex instanceof Error && ex.message ? ex.message : 'No se pudo enviar el enlace.');
          } finally { setEmailSaving(false); }
        }} style={{ padding: '14px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" required placeholder="nuevo@correo.com"
              style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s800)', outline: 'none' }} />
            {emailErr  && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={13} />{emailErr}</div>}
            {emailSaved && <div style={{ fontSize: 12.5, color: '#065f46', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={13} />{emailSaved}</div>}
            <button type="submit" disabled={emailSaving || !newEmail.trim()}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: emailSaving ? 'var(--s200)' : '#0369a1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: emailSaving ? 'wait' : 'pointer' }}>
              <Mail size={14} />{emailSaving ? 'Enviando…' : 'Enviar enlace de confirmación'}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* Admin-only test-data wipe — only when the server has it enabled */}
      {user?.data_reset_enabled && (user?.roles ?? []).includes('CLINIC_ADMIN') && <DataResetCard />}
    </>
  );
}

// Wipes all clinical test data for the organization. Gated three ways: the
// server flag (ALLOW_DATA_RESET), the CLINIC_ADMIN role, and a typed
// confirmation. Meant for the testing phase only.
function DataResetCard() {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState('');
  const [err, setErr]         = useState('');

  const handleReset = async () => {
    setErr(''); setDone('');
    if (confirm !== 'ELIMINAR') { setErr('Escribe ELIMINAR para confirmar.'); return; }
    setBusy(true);
    try {
      const res = await adminApi.resetClinicalData(confirm);
      const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      setDone(`Datos de prueba eliminados (${total} registros). La base quedó limpia.`);
      setConfirm('');
      queryClient.invalidateQueries();
    } catch {
      setErr('No se pudo limpiar los datos. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Zona de pruebas — limpiar datos" icon={Trash2} color="#dc2626">
      <div style={{ padding: '14px 0' }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: '#991b1b', lineHeight: 1.6 }}>
            Elimina <b>todos</b> los pacientes, citas, registros clínicos, borradores de IA y
            consentimientos firmados de la organización. <b>Conserva</b> tu perfil profesional con
            firma, las plantillas de consentimiento, los usuarios y los catálogos.
            Es <b>irreversible</b> — úsalo solo mientras haces pruebas.
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6 }}>Escribe <b>ELIMINAR</b> para confirmar</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setErr(''); }}
            placeholder="ELIMINAR"
            style={{ padding: '9px 12px', borderRadius: 9, border: `1.5px solid ${err ? '#dc2626' : 'var(--s200)'}`, fontSize: 13, width: 180, letterSpacing: 1, fontWeight: 600 }}
          />
          <button
            onClick={handleReset}
            disabled={busy || confirm !== 'ELIMINAR'}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: busy || confirm !== 'ELIMINAR' ? 'var(--s200)' : '#dc2626', color: busy || confirm !== 'ELIMINAR' ? 'var(--s400)' : '#fff', fontSize: 13, fontWeight: 700, cursor: busy || confirm !== 'ELIMINAR' ? 'not-allowed' : 'pointer' }}
          >
            {busy
              ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Limpiando…</>
              : <><Trash2 size={14} />Limpiar datos de prueba</>}
          </button>
        </div>
        {err  && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{err}</div>}
        {done && <div style={{ fontSize: 12.5, color: '#10b981', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} />{done}</div>}
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

// ── Users section ────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'PROFESSIONAL',  label: 'Psicólogo/a profesional' },
  { value: 'INTERN',        label: 'Practicante supervisado' },
  { value: 'RECEPTIONIST',  label: 'Recepcionista' },
];

const ASSIGNABLE_ROLES = [
  { value: 'CLINIC_ADMIN',   label: 'Administrador' },
  { value: 'PROFESSIONAL',   label: 'Psicólogo/a profesional' },
  { value: 'INTERN',         label: 'Practicante supervisado' },
  { value: 'RECEPTIONIST',   label: 'Recepcionista' },
];

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  CLINIC_ADMIN:  { label: 'Admin',          color: '#0369a1', bg: '#e0f2fe' },
  PROFESSIONAL:  { label: 'Profesional',    color: '#065f46', bg: '#d1fae5' },
  INTERN:        { label: 'Practicante',    color: '#92400e', bg: '#fef3c7' },
  RECEPTIONIST:  { label: 'Recepcionista',  color: '#475569', bg: '#f1f5f9' },
};

function TeamCard({ selfId }: { selfId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => authApi.listOrgUsers(),
  });
  const users = data?.items ?? [];
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);

  const changeRole = async (userId: string, roleName: string) => {
    setRowErr(e => ({ ...e, [userId]: '' }));
    try {
      await authApi.changeUserRole(userId, roleName);
      qc.invalidateQueries({ queryKey: ['org-users'] });
    } catch (ex) {
      setRowErr(e => ({ ...e, [userId]: ex instanceof Error ? ex.message : 'Error al cambiar rol' }));
    }
  };

  const handleRemove = async (u: { id: string; display_name: string | null; email: string }) => {
    const name = u.display_name || u.email;
    if (!window.confirm(`¿Eliminar a "${name}" del equipo?\n\nSu historial clínico se conserva pero no podrá volver a iniciar sesión.`)) return;
    setRemoving(u.id);
    setRowErr(e => ({ ...e, [u.id]: '' }));
    try {
      await authApi.deactivateUser(u.id);
      qc.invalidateQueries({ queryKey: ['org-users'] });
    } catch (ex) {
      setRowErr(e => ({ ...e, [u.id]: ex instanceof Error ? ex.message : 'Error al eliminar' }));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <SectionCard title="Equipo" icon={Users} color="#0ea5e9">
      {isLoading ? (
        <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : users.length === 0 ? (
        <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--s400)' }}>No hay usuarios en la organización.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 8 }}>
          {users.map(u => {
            const isSelf = u.id === selfId;
            const badge = ROLE_BADGE[u.role_name] ?? { label: u.role_name, color: '#475569', bg: '#f1f5f9' };
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--s100)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.display_name || u.email}
                  </div>
                  {u.display_name && <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>{u.email}</div>}
                </div>
                <Badge label={badge.label} color={badge.color} bg={badge.bg} />
                <select
                  disabled={isSelf}
                  value={u.role_name}
                  onChange={e => changeRole(u.id, e.target.value)}
                  title={isSelf ? 'No puedes cambiar tu propio rol' : 'Cambiar rol'}
                  style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid var(--s200)', fontSize: 12.5, color: 'var(--s700)', cursor: isSelf ? 'not-allowed' : 'pointer', background: isSelf ? 'var(--s100)' : '#fff' }}>
                  {ASSIGNABLE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {!isSelf && (
                  <button
                    onClick={() => handleRemove(u)}
                    disabled={removing === u.id}
                    title="Eliminar del equipo"
                    style={{ border: 'none', background: 'transparent', color: removing === u.id ? 'var(--s300)' : '#dc2626', cursor: removing === u.id ? 'wait' : 'pointer', padding: '4px 6px', borderRadius: 6, fontSize: 15, lineHeight: 1 }}>
                    ✕
                  </button>
                )}
                {rowErr[u.id] && <div style={{ fontSize: 11.5, color: 'var(--red)' }}>{rowErr[u.id]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function UsersSection() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('CLINIC_ADMIN') ?? false;
  const isProfessional = user?.roles?.includes('PROFESSIONAL') ?? false;
  // Only admins and practitioners may invite; interns/receptionists cannot.
  const canInvite = isAdmin || isProfessional;
  // A non-admin professional can invite support roles only; an admin, any role.
  const availableRoles = isAdmin ? ROLES : ROLES.filter(r => r.value !== 'PROFESSIONAL');
  const [roleName,     setRoleName]     = useState(isAdmin ? 'PROFESSIONAL' : 'INTERN');
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
      {canInvite && (
      <SectionCard title="Invitar nuevo usuario" icon={Plus} color="#0ea5e9">
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 14, lineHeight: 1.6 }}>
            Genera un código de invitación de un solo uso (válido 48 horas). El nuevo usuario lo ingresa en la pantalla de registro.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 6, fontWeight: 500 }}>Rol a asignar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {availableRoles.map(r => (
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
      )}

      {isAdmin && <SectionCard title="Restablecer contraseña" icon={Key} color="#ef4444">
        <form onSubmit={handleResetPassword} style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 14, lineHeight: 1.6 }}>
            Como administrador puedes restablecer la contraseña de cualquier usuario de tu organización.
            Cada usuario también puede hacerlo por su cuenta desde <b>"¿Olvidaste tu contraseña?"</b> en el inicio de sesión.
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

      {!canInvite && !isAdmin && (
        <SectionCard title="Usuarios" icon={Users} color="#0ea5e9">
          <div style={{ padding: '16px 0', fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.6 }}>
            No tienes permisos para invitar o administrar usuarios. Si necesitas dar acceso a alguien,
            pídeselo al administrador o al profesional de tu consultorio.
          </div>
        </SectionCard>
      )}

      {isAdmin && <TeamCard selfId={user?.user_id ?? ''} />}
    </>
  );
}

// ── Billing / service-rate catalogue section ──────────────────────────────────

const MODALITY_LABELS: Record<string, string> = {
  IN_PERSON: 'Presencial',
  VIRTUAL:   'Virtual',
  HYBRID:    'Híbrida',
};

// formatMoney renders a decimal string ("80000.00") as a grouped amount without
// the trailing ",00" when there are no cents — never parsing money as a float.
function formatMoney(amount: string, currency: string): string {
  const [intPart, fracRaw = ''] = amount.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fracRaw.replace(/0+$/, '');
  const sym = currency === 'COP' ? '$' : '';
  return `${sym}${grouped}${frac ? ',' + frac : ''} ${currency}`;
}

const EMPTY_RATE = { name: '', description: '', amount: '', currency: 'COP', modality: '' as '' | RateModality };

function RatesSection() {
  const [rates,   setRates]   = useState<ServiceRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [editing, setEditing] = useState<string | null>(null); // rate id, 'new', or null
  const [form,    setForm]    = useState(EMPTY_RATE);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = () => {
    setLoading(true);
    serviceRatesApi.list(true)
      .then(setRates)
      .catch(() => setLoadErr('No se pudieron cargar las tarifas.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setForm(EMPTY_RATE); setFormErr(''); setEditing('new'); };
  const openEdit = (r: ServiceRate) => {
    setForm({ name: r.name, description: r.description ?? '', amount: r.amount, currency: r.currency, modality: (r.modality ?? '') as '' | RateModality });
    setFormErr(''); setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setFormErr(''); };

  const save = async () => {
    setSaving(true); setFormErr('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      amount: form.amount.trim().replace(/\s/g, ''), // dot = decimal separator (see field hint)
      currency: form.currency || 'COP',
      modality: form.modality === '' ? null : form.modality,
    };
    try {
      if (editing === 'new') await serviceRatesApi.create(payload);
      else if (editing)      await serviceRatesApi.update(editing, payload);
      setEditing(null);
      load();
    } catch (e) {
      setFormErr(e instanceof Error && e.message ? e.message : 'No se pudo guardar la tarifa.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: ServiceRate) => {
    setRates(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !x.is_active } : x));
    try { await serviceRatesApi.setActive(r.id, !r.is_active); }
    catch { load(); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, padding: '12px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 11, fontSize: 12.5, color: '#065f46', lineHeight: 1.55 }}>
        <Receipt size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Define los precios de tus servicios. Estas tarifas se usarán al generar facturas y comprobantes de pago. No constituyen facturación electrónica DIAN.</span>
      </div>

      <SectionCard title="Tarifario de servicios" icon={Receipt} color="#10b981">
        {loading ? (
          <div style={{ padding: '22px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : loadErr ? (
          <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--red)' }}>{loadErr}</div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {rates.length === 0 && editing !== 'new' && (
              <div style={{ padding: '18px 0', fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.6 }}>
                Aún no tienes tarifas. Crea la primera para empezar a facturar tus sesiones.
              </div>
            )}

            {rates.map(r => editing === r.id ? (
              <RateForm key={r.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} err={formErr} />
            ) : (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--s100)', opacity: r.is_active ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>{r.name}</span>
                    {r.modality && <Badge label={MODALITY_LABELS[r.modality] ?? r.modality} color="#0369a1" bg="#e0f2fe" />}
                    {!r.is_active && <Badge label="Inactiva" color="var(--s500)" bg="var(--s100)" />}
                  </div>
                  {r.description && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{r.description}</div>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>
                  {formatMoney(r.amount, r.currency)}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(r)} title="Editar"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s500)', cursor: 'pointer' }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => toggleActive(r)} title={r.is_active ? 'Desactivar' : 'Activar'}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--s200)', background: '#fff', color: r.is_active ? 'var(--s500)' : '#10b981', cursor: 'pointer' }}>
                    {r.is_active ? <X size={14} /> : <CheckCircle size={14} />}
                  </button>
                </div>
              </div>
            ))}

            {editing === 'new' && (
              <RateForm form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} err={formErr} />
            )}

            {editing !== 'new' && (
              <button onClick={openNew} style={{
                display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '9px 18px', borderRadius: 9, border: 'none',
                background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                <Plus size={14} />Nueva tarifa
              </button>
            )}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function RateForm({ form, setForm, onSave, onCancel, saving, err }: {
  form: typeof EMPTY_RATE; setForm: (f: typeof EMPTY_RATE) => void;
  onSave: () => void; onCancel: () => void; saving: boolean; err: string;
}) {
  const upd = (patch: Partial<typeof EMPTY_RATE>) => setForm({ ...form, ...patch });
  return (
    <div style={{ padding: '14px 16px', margin: '8px 0', background: 'var(--s50)', borderRadius: 11, border: '1.5px solid var(--s200)' }}>
      <FieldRow label="Nombre" sub="Ej: Sesión individual, Primera consulta">
        <FInput value={form.name} onChange={v => upd({ name: v })} placeholder="Sesión individual" />
      </FieldRow>
      <FieldRow label="Descripción" sub="Opcional">
        <FInput value={form.description} onChange={v => upd({ description: v })} placeholder="Detalle visible en la factura" />
      </FieldRow>
      <FieldRow label="Monto" sub="Sin puntos de mil; usa punto para decimales (ej: 80000)">
        <FInput value={form.amount} onChange={v => upd({ amount: v })} placeholder="80000" mono />
      </FieldRow>
      <FieldRow label="Moneda">
        <FSelect value={form.currency} onChange={v => upd({ currency: v })}>
          <option value="COP">COP — Peso colombiano</option>
          <option value="USD">USD — Dólar</option>
          <option value="EUR">EUR — Euro</option>
        </FSelect>
      </FieldRow>
      <FieldRow label="Modalidad" sub="Opcional — aplica a todas si se deja vacío">
        <FSelect value={form.modality} onChange={v => upd({ modality: v as '' | RateModality })}>
          <option value="">Todas las modalidades</option>
          <option value="IN_PERSON">Presencial</option>
          <option value="VIRTUAL">Virtual</option>
          <option value="HYBRID">Híbrida</option>
        </FSelect>
      </FieldRow>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', padding: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{err}</div>}
      <div style={{ display: 'flex', gap: 8, paddingTop: 14 }}>
        <button onClick={onSave} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
          background: saving ? 'var(--s200)' : '#10b981', color: saving ? 'var(--s400)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? 'Guardando…' : <><Save size={14} />Guardar tarifa</>}
        </button>
        <button onClick={onCancel} disabled={saving} style={{
          padding: '9px 18px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff',
          color: 'var(--s600)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<SectionId>('profile');
  const [dirty,   setDirty]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Section-specific save functions registered via ref
  const aiSaveRef = React.useRef<(() => Promise<void>) | null>(null);

  // Interns and receptionists can't manage staff or edit clinical templates, so
  // those sections aren't shown to them at all (the backend also gates them).
  const roles = user?.roles ?? [];
  const canManageOrg = roles.includes('CLINIC_ADMIN') || roles.includes('PROFESSIONAL');
  const isAdmin = roles.includes('CLINIC_ADMIN');
  // Rate management needs billing:manage_rates (CLINIC_ADMIN); staff/templates
  // need org management. The backend enforces all three regardless.
  const visibleSections = SECTIONS.filter(s => {
    if (s.id === 'billing') return isAdmin;
    if (s.id === 'users' || s.id === 'templates') return canManageOrg;
    return true;
  });

  const handleSave = async (doSave: boolean) => {
    if (!doSave) { setDirty(false); return; }
    setSaving(true);
    try {
      if (section === 'ai' && aiSaveRef.current) await aiSaveRef.current();
    } catch { /* ignore — section shows its own error state */ }
    setSaving(false);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const markDirty = (v: boolean) => setDirty(v);
  const activeSection = visibleSections.find(s => s.id === section) ?? visibleSections[0];
  const compact = useIsCompact();

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', ...(compact ? { minHeight: 'calc(100vh - var(--topbar-h))' } : { height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }) }}>

      {/* ── Settings nav: side column on desktop, scrollable tab bar on small screens */}
      {compact ? (
        <div style={{ background: '#fff', borderBottom: '1px solid var(--s200)', overflowX: 'auto', flexShrink: 0 }}>
          <nav style={{ display: 'flex', gap: 4, padding: '8px 10px', minWidth: 'max-content' }}>
            {visibleSections.map(item => {
              const on = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: 'none', background: on ? 'var(--teal-l)' : 'transparent', color: on ? 'var(--teal-d)' : 'var(--s600)', fontSize: 12.5, fontWeight: on ? 700 : 400, whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  <item.icon size={14} color={on ? 'var(--teal)' : 'var(--s400)'} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      ) : (
      <div style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid var(--s200)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--s800)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={15} color="var(--teal)" />Configuración
          </div>
        </div>
        <nav style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
          {(() => {
            const groups: string[] = [];
            return visibleSections.map(item => {
              const on = section === item.id;
              const showLabel = !groups.includes(item.group);
              if (showLabel) groups.push(item.group);
              return (
                <div key={item.id}>
                  {showLabel && (
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--s300)',
                      letterSpacing: '.08em', textTransform: 'uppercase',
                      padding: '10px 12px 4px', marginTop: groups.length > 1 ? 6 : 0,
                    }}>{item.group}</div>
                  )}
                  <button
                    onClick={() => setSection(item.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 9, border: 'none', background: on ? 'var(--teal-l)' : 'transparent', color: on ? 'var(--teal-d)' : 'var(--s600)', fontSize: 13.5, fontWeight: on ? 700 : 400, fontFamily: "'DM Sans', sans-serif", marginBottom: 2, textAlign: 'left', transition: 'all .12s', cursor: 'pointer' }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--s50)'; }}
                    onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <item.icon size={15} color={on ? 'var(--teal)' : (item.color ?? 'var(--s400)')} />
                    {item.label}
                  </button>
                </div>
              );
            });
          })()}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--s100)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>SGHCP v0.5.0 · 2026</div>
          <div style={{ fontSize: 11, color: 'var(--s300)', marginTop: 2 }}>Ley 1581/2012 · Res. 1995/1999</div>
        </div>
      </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: compact ? 'visible' : 'hidden', minWidth: 0 }}>
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
        <div style={{ flex: 1, overflow: compact ? 'visible' : 'auto' }}>
          <div style={{ padding: compact ? '18px 14px' : '24px 28px', maxWidth: 780 }}>
            {section === 'profile'       && <ProfileSection       setDirty={markDirty} />}
            {section === 'schedule'      && <ScheduleSection />}
            {section === 'notifications' && <NotificationsSection setDirty={markDirty} />}
            {section === 'ai'            && <AISection            setDirty={markDirty} saveRef={aiSaveRef} />}
            {section === 'security'      && <SecuritySection />}
            {section === 'templates'     && <ConsentTemplatesSection />}
            {section === 'billing'       && <RatesSection />}
            {section === 'users'         && <UsersSection />}
          </div>
          <SaveBar dirty={dirty} saving={saving} saved={saved} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}
