import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { orgApi, type WhatsAppSettings } from '@/api/org';
import { Toggle, FieldRow, FInput, SectionCard } from './primitives';

export function WhatsAppCard({ setDirty }: { setDirty: (v: boolean) => void }) {
  const blank: WhatsAppSettings = {
    enabled: false, phone_number_id: '', waba_id: '',
    tpl_reminder_24h: '', tpl_reminder_2h: '', tpl_booking: '',
    lang: 'es_CO', token_set: false,
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
        tpl_booking: s.tpl_booking.trim(), lang: s.lang || 'es_CO', access_token: token.trim(),
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
        <FInput value={s.lang} onChange={v => upd('lang', v)} mono disabled={loading} placeholder="es_CO" />
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

