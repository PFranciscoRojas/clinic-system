import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  UserRound, Clock, Bell, Sparkles, ShieldCheck,
  FileText, Settings, Users, Receipt, Plug,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useIsCompact } from '@/lib/useMediaQuery';
import { SaveBar } from '@/components/settings/primitives';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { ScheduleSection } from '@/components/settings/ScheduleSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { AISection } from '@/components/settings/AISection';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { AuditLogSection } from '@/components/settings/AuditLogSection';
import { ConsentTemplatesSection } from '@/components/settings/ConsentTemplatesSection';
import { UsersSection } from '@/components/settings/UsersSection';
import { PlanStatusCard, RatesSection, ReferralCard } from '@/components/settings/BillingSection';
import { IntegrationsSection } from '@/components/settings/IntegrationsSection';
import RecordTemplatesSection from '@/components/clinical/RecordTemplatesSection';

// ── Sections ──────────────────────────────────────────────────────────────────
// Each section is a sub-route (/settings/:section) so it is deep-linkable and
// the browser back button navigates between sections.

type SectionId = 'profile' | 'schedule' | 'notifications' | 'ai' | 'security' | 'templates' | 'record_templates' | 'billing' | 'users' | 'integrations';

const SECTIONS: { id: SectionId; icon: React.ElementType; label: string; color?: string; group: string }[] = [
  { id: 'profile',       icon: UserRound,  label: 'Perfil profesional',  group: 'Personal'     },
  { id: 'schedule',      icon: Clock,       label: 'Horario y agenda',    group: 'Personal'     },
  { id: 'security',      icon: ShieldCheck, label: 'Seguridad',            group: 'Personal',    color: '#ef4444' },
  { id: 'ai',            icon: Sparkles,    label: 'Asistente IA',         group: 'Herramientas',color: '#f59e0b' },
  { id: 'notifications', icon: Bell,        label: 'Notificaciones',       group: 'Herramientas' },
  { id: 'templates',        icon: FileText,  label: 'Plantillas clínicas',  group: 'Herramientas',color: '#7d75c7' },
  { id: 'record_templates', icon: FileText,  label: 'Formatos de registro',  group: 'Herramientas',color: '#5b52ad' },
  { id: 'billing',       icon: Receipt,     label: 'Tarifas',              group: 'Equipo',      color: '#10b981' },
  { id: 'users',         icon: Users,       label: 'Usuarios',             group: 'Equipo',      color: '#0ea5e9' },
  { id: 'integrations',  icon: Plug,        label: 'Integraciones',        group: 'Equipo',      color: '#5b52ad' },
];

export function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section: string }>();
  const [dirty,   setDirty]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Section-specific save functions registered via ref
  const aiSaveRef = React.useRef<(() => Promise<void>) | null>(null);

  // Interns and receptionists can't manage staff or edit clinical templates, so
  // those sections aren't shown to them at all (the backend also gates them).
  const roles = user?.roles ?? [];
  const isSysAdmin = roles.includes('SYSTEM_ADMIN');
  const canManageOrg = roles.includes('CLINIC_ADMIN') || roles.includes('PROFESSIONAL');
  const isAdmin = roles.includes('CLINIC_ADMIN');
  // Rate management needs billing:manage_rates (CLINIC_ADMIN); staff/templates
  // need org management. SYSTEM_ADMIN only sees Perfil + Seguridad (no clinical tools).
  const visibleSections = SECTIONS.filter(s => {
    if (s.id === 'billing' || s.id === 'integrations') return isAdmin;
    if (s.id === 'users' || s.id === 'templates') return canManageOrg;
    if (s.id === 'schedule' || s.id === 'ai' || s.id === 'notifications') return !isSysAdmin;
    return true;
  });

  // The access trail lives at the foot of Seguridad rather than as an entry of
  // its own: it is consulted when something happened, not configured, and a
  // second red item next to Seguridad read as an alarm on every visit. It needs
  // audit_log:read — held by admins and professionals, not by interns or
  // receptionists, and meaningless for the SaaS operator.
  const canReadAudit = !isSysAdmin && canManageOrg;

  // /settings → first visible section; unknown or not-visible id → same
  // fallback, except /settings/audit, which is where the trail used to live and
  // may still be bookmarked: it lands on the section that now contains it.
  const requestedSection = sectionParam === 'audit' ? 'security' : sectionParam;
  const section: SectionId = visibleSections.some(s => s.id === requestedSection)
    ? (requestedSection as SectionId)
    : visibleSections[0].id;
  const setSection = (id: SectionId) => navigate(`/settings/${id}`);

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
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', ...(compact ? { minHeight: 'calc(100dvh - var(--topbar-h))' } : { height: 'calc(100dvh - var(--topbar-h))', overflow: 'hidden' }) }}>

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
          <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>Chapni v0.5.0 · 2026</div>
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
          <div style={{ padding: compact ? '18px 14px' : '24px 28px', maxWidth: section === 'record_templates' ? 1400 : 780 }}>
            {section === 'profile'       && <ProfileSection       setDirty={markDirty} />}
            {section === 'schedule'      && <ScheduleSection />}
            {section === 'notifications' && <NotificationsSection setDirty={markDirty} />}
            {section === 'ai'            && <AISection            setDirty={markDirty} saveRef={aiSaveRef} />}
            {section === 'security'      && <><SecuritySection />{canReadAudit && <AuditLogSection />}</>}
            {section === 'templates'        && <ConsentTemplatesSection />}
            {section === 'record_templates' && <RecordTemplatesSection />}
            {section === 'billing'          && <><PlanStatusCard /><ReferralCard /><RatesSection /></>}
            {section === 'users'         && <UsersSection />}
            {section === 'integrations'  && <IntegrationsSection />}
          </div>
          <SaveBar dirty={dirty} saving={saving} saved={saved} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}
