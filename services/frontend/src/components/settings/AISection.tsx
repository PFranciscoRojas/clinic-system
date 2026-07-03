import React, { useState, useEffect } from 'react';
import { Sparkles, ShieldCheck, PenLine } from 'lucide-react';
import { profilesApi, type TherapeuticApproach } from '@/api/profiles';
import { FieldRow, FSelect, SectionCard } from './primitives';

const NOTE_STYLES = [
  { id: 'structured', label: 'Estructurado', desc: 'Técnico-clínico estándar' },
  { id: 'narrative',  label: 'Narrativo',    desc: 'Redacción fluida'         },
];

// Mirrors the backend catalog (ai_prefs.approach) — orients the AI's
// treatment-plan proposals, recaps and draft wording.
const APPROACHES: { id: TherapeuticApproach; label: string }[] = [
  { id: '',              label: 'Sin definir (neutro)' },
  { id: 'cbt',           label: 'Terapia cognitivo-conductual (TCC)' },
  { id: 'humanistic',    label: 'Humanista (centrada en la persona)' },
  { id: 'psychodynamic', label: 'Psicodinámico' },
  { id: 'systemic',      label: 'Sistémico' },
  { id: 'gestalt',       label: 'Gestalt' },
  { id: 'act',           label: 'Aceptación y compromiso (ACT)' },
  { id: 'dbt',           label: 'Dialéctico-conductual (DBT)' },
  { id: 'integrative',   label: 'Integrador' },
];

export function AISection({ setDirty, saveRef }: { setDirty: (v: boolean) => void; saveRef: React.MutableRefObject<(() => Promise<void>) | null> }) {
  const mrk = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  const [style,      setStyle]      = useState('structured');
  const [tone,       setTone]       = useState('formal');
  const [approach,   setApproach]   = useState<TherapeuticApproach>('');
  const [dataRetain, setDataRetain] = useState('180');

  useEffect(() => {
    profilesApi.getAIPrefs()
      .then(r => {
        if (r.ai_prefs.note_style)   setStyle(r.ai_prefs.note_style);
        if (r.ai_prefs.tone)         setTone(r.ai_prefs.tone);
        if (r.ai_prefs.approach)     setApproach(r.ai_prefs.approach);
        if (r.ai_prefs.data_retain)  setDataRetain(r.ai_prefs.data_retain);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    saveRef.current = async () => {
      await profilesApi.saveAIPrefs({ note_style: style, tone, approach, data_retain: dataRetain });
    };
    return () => { saveRef.current = null; };
  }, [style, tone, approach, dataRetain, saveRef]);

  return (
    <>
      <SectionCard title="Asistente IA de redacción" icon={Sparkles} color="#f59e0b">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={20} color="#f59e0b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#78350f' }}>Chapni IA v2.1 · Activo</div>
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
        <FieldRow
          label="Enfoque terapéutico"
          sub="Orienta el plan terapéutico sugerido, los recaps y la redacción de borradores al enfoque con el que trabajas. La detección de riesgo no se adapta: siempre es conservadora."
        >
          <FSelect value={approach} onChange={mrk(setApproach as (v: string) => void)}>
            {APPROACHES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
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

