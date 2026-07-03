import { useState, useEffect } from 'react';
import { UserRound, CheckCircle, Upload, Palette, Trash2, Save, Shield, LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { profilesApi, splitName, type Specialty } from '@/api/profiles';
import { ACCENT_COLORS, saveAccentColor } from '@/lib/theme';
import { GoogleCalendarCard } from './GoogleCalendarCard';
import { FieldRow, FInput, FSelect, SectionCard } from './primitives';

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  CLINIC_ADMIN:  { color: '#065f46', bg: '#d1fae5' },
  PROFESSIONAL:  { color: '#0369a1', bg: '#e0f2fe' },
  INTERN:        { color: '#92400e', bg: '#fef3c7' },
  RECEPTIONIST:  { color: '#2a2769', bg: '#e4e2f6' },
  SYSTEM_ADMIN:  { color: '#991b1b', bg: '#fee2e2' },
};
export function ProfileSection({ setDirty }: { setDirty: (v: boolean) => void }) {
  const { user, logout, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const mark = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  const savedProfile = (() => { try { return JSON.parse(localStorage.getItem('sghcp_profile') ?? '{}'); } catch { return {}; } })();
  // display_name from the JWT is the source of truth for the app UI.
  const [name,      setName]      = useState(user?.display_name || savedProfile.name || '');
  const [email,     setEmail]     = useState(user?.email ?? '');
  const savedAccent = localStorage.getItem(`sghcp_accent_${user?.user_id}`) ?? '#363285';
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
            {color !== '#363285' && (
              <button onClick={() => { setColor('#363285'); saveAccentColor('#363285', user?.user_id); }} style={{ fontSize: 11.5, color: 'var(--s400)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
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

