import { useAuth } from '@/context/AuthContext';
import { User, Shield, Building2, Key, Bell, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  CLINIC_ADMIN:  { color: '#065f46', bg: '#d1fae5' },
  PROFESSIONAL:  { color: '#0369a1', bg: '#e0f2fe' },
  INTERN:        { color: '#92400e', bg: '#fef3c7' },
  RECEPTIONIST:  { color: '#4c1d95', bg: '#ede9fe' },
  SYSTEM_ADMIN:  { color: '#991b1b', bg: '#fee2e2' },
};

type Tab = 'profile' | 'security' | 'notifications';

import { useState } from 'react';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  const TABS = [
    { id: 'profile' as Tab,       label: 'Mi perfil',      Icon: User  },
    { id: 'security' as Tab,      label: 'Seguridad',      Icon: Key   },
    { id: 'notifications' as Tab, label: 'Notificaciones', Icon: Bell  },
  ];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 6px' }}>Configuración</h1>
      <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 28px' }}>Gestiona tu cuenta y preferencias</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--s100)', borderRadius: 12, padding: 4 }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '9px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === id ? 600 : 400,
              background: tab === id ? '#fff' : 'transparent',
              color: tab === id ? 'var(--s800)' : 'var(--s400)',
              boxShadow: tab === id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all .15s',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Info card */}
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--teal), #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User size={32} color="#fff" />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--s800)', margin: '0 0 6px' }}>
                  {user?.display_name ?? user?.email}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--s400)', margin: '0 0 10px' }}>{user?.email}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {user?.roles.map(role => {
                    const cfg = ROLE_COLORS[role] ?? { color: 'var(--s600)', bg: 'var(--s100)' };
                    return <Badge key={role} label={role.replace('_', ' ')} color={cfg.color} bg={cfg.bg} />;
                  })}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--s100)', marginBottom: 24 }} />

            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--s700)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={14} color="var(--teal)" /> Organización
            </h3>
            <InfoRow label="ID de organización" value={user?.org_id ?? '—'} mono />
            <InfoRow label="ID de usuario" value={user?.user_id ?? '—'} mono />
          </div>

          {/* Permissions */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--s700)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={14} color="var(--teal)" /> Permisos activos
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(user?.permissions ?? []).sort().map(p => (
                <span key={p} style={{
                  fontSize: 11, fontWeight: 500, padding: '3px 9px',
                  background: 'var(--s100)', color: 'var(--s600)', borderRadius: 6,
                  fontFamily: 'DM Mono, monospace',
                }}>
                  {p}
                </span>
              ))}
              {(!user?.permissions || user.permissions.length === 0) && (
                <p style={{ color: 'var(--s400)', fontSize: 13 }}>Sin permisos asignados — cierra sesión y vuelve a entrar</p>
              )}
            </div>
          </div>

          {/* Logout */}
          <div className="card" style={{ padding: 20 }}>
            <button
              onClick={logout}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                background: '#fef2f2', color: 'var(--red)', border: '1.5px solid #fecaca',
                borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 20px' }}>Seguridad</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SecurityRow
              title="Contraseña"
              subtitle="Última actualización: desconocida"
              action="Cambiar contraseña"
            />
            <SecurityRow
              title="Autenticación de dos factores"
              subtitle="MFA no configurado"
              action="Configurar MFA"
            />
            <SecurityRow
              title="Sesiones activas"
              subtitle="Ver y cerrar sesiones en otros dispositivos"
              action="Ver sesiones"
            />
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 20px' }}>Notificaciones</h3>
          <p style={{ color: 'var(--s400)', fontSize: 14 }}>Configuración de notificaciones próximamente disponible.</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--s100)' }}>
      <span style={{ fontSize: 13, color: 'var(--s500)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--s700)', fontWeight: 500, fontFamily: mono ? 'DM Mono, monospace' : undefined }}>
        {value}
      </span>
    </div>
  );
}

function SecurityRow({ title, subtitle, action }: { title: string; subtitle: string; action: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>{title}</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)', marginTop: 3 }}>{subtitle}</p>
      </div>
      <button style={{ fontSize: 13, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
        {action}
      </button>
    </div>
  );
}
