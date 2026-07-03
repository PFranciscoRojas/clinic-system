import { useState, useEffect } from 'react';
import { Bell, Send, AlertCircle, Plug } from 'lucide-react';
import { orgApi } from '@/api/org';
import { Toggle, SectionCard } from './primitives';

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
export function NotificationsSection({ setDirty }: { setDirty: (v: boolean) => void }) {
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
        <div style={{ padding: '12px 0 4px', fontSize: 12.5, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plug size={12} color="#5b52ad" />
          <span>La configuración de WhatsApp (Meta) se gestiona en <b>Integraciones</b>.</span>
        </div>
      </SectionCard>

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

