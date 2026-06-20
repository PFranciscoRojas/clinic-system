import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Formulation5FData, Factor5F } from './constants';
import {
  PREDISPOSITION_OPTIONS, ONSET_OPTIONS, PATHWAY_OPTIONS,
  TRIGGER_OPTIONS, MAINTENANCE_OPTIONS, PROTECTION_OPTIONS,
} from './constants';

interface Props {
  value: Formulation5FData;
  onChange: (v: Formulation5FData) => void;
  disabled?: boolean;
}

function toggle(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

interface CheckboxGroupProps {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}
function CheckboxGroup({ options, selected, onToggle, disabled }: CheckboxGroupProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map(opt => (
        <label key={opt.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
          <input
            type="checkbox" checked={selected.includes(opt.key)} disabled={disabled}
            onChange={() => onToggle(opt.key)}
            style={{ marginTop: 2, accentColor: 'var(--teal)', cursor: disabled ? 'default' : 'pointer' }}
          />
          <span style={{ fontSize: 13, color: 'var(--s700)', lineHeight: '1.4' }}>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

interface AccordionProps {
  title: string;
  number: string;
  subtitle: string;
  hasContent: boolean;
  children: React.ReactNode;
}
function Accordion({ title, number, subtitle, hasContent, children }: AccordionProps) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      border: `1.5px solid ${hasContent ? 'var(--teal)' : 'var(--s200)'}`,
      borderRadius: 10, overflow: 'hidden',
      background: hasContent ? '#f0fafa' : '#fafafa',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: hasContent ? 'var(--teal)' : 'var(--s200)',
          color: '#fff', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{number}</span>
        <span style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s800)' }}>{title}</span>
          <span style={{ fontSize: 12, color: 'var(--s400)', marginLeft: 8 }}>{subtitle}</span>
        </span>
        {open ? <ChevronDown size={16} color="var(--s400)" /> : <ChevronRight size={16} color="var(--s400)" />}
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Formulación Clínica Macro — Modelo de los 5 Factores (Formato 1, sección V).
// Shown only in INITIAL records as a full-width card below the 2-column grid.
export function ClinicalFormulation5F({ value, onChange, disabled }: Props) {
  const setFactor = (key: keyof Omit<Formulation5FData, 'acquisition'>, patch: Partial<Factor5F>) =>
    onChange({ ...value, [key]: { ...(value[key] as Factor5F), ...patch } });

  const setAcq = (patch: Partial<Formulation5FData['acquisition']>) =>
    onChange({ ...value, acquisition: { ...value.acquisition, ...patch } });

  const hasContent = (f: Factor5F) => f.selected.length > 0 || f.notes.trim() !== '';
  const hasAcq = value.acquisition.onset !== '' || value.acquisition.pathway.length > 0 || value.acquisition.notes.trim() !== '';

  const notesStyle: React.CSSProperties = {
    marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--s200)', fontSize: 13, color: 'var(--s700)',
    boxSizing: 'border-box', background: '#fff', resize: 'vertical', minHeight: 52,
  };

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
        V. Formulación clínica — Modelo de los 5 Factores
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--s400)' }}>
        Marca lo que aplica según la historia recolectada. Los factores marcados quedan en la historia clínica.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* 1. Predisposición */}
        <Accordion number="1" title="Predisposición" subtitle="Vulnerabilidades previas" hasContent={hasContent(value.predisposition)}>
          <CheckboxGroup
            options={PREDISPOSITION_OPTIONS} selected={value.predisposition.selected}
            onToggle={key => setFactor('predisposition', { selected: toggle(value.predisposition.selected, key) })}
            disabled={disabled}
          />
          <textarea
            value={value.predisposition.notes} disabled={disabled}
            onChange={e => setFactor('predisposition', { notes: e.target.value })}
            placeholder="Notas específicas…"
            style={notesStyle}
          />
        </Accordion>

        {/* 2. Adquisición */}
        <Accordion number="2" title="Adquisición" subtitle="Origen o aprendizaje inicial del problema" hasContent={hasAcq}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--s600)' }}>Época de inicio:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {ONSET_OPTIONS.map(opt => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'default' : 'pointer' }}>
                <input
                  type="radio" name="onset" value={opt.key} disabled={disabled}
                  checked={value.acquisition.onset === opt.key}
                  onChange={() => setAcq({ onset: opt.key })}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ fontSize: 13, color: 'var(--s700)' }}>{opt.label}</span>
              </label>
            ))}
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--s600)' }}>Vía de aprendizaje:</p>
          <CheckboxGroup
            options={PATHWAY_OPTIONS} selected={value.acquisition.pathway}
            onToggle={key => setAcq({ pathway: toggle(value.acquisition.pathway, key) })}
            disabled={disabled}
          />
          <textarea
            value={value.acquisition.notes} disabled={disabled}
            onChange={e => setAcq({ notes: e.target.value })}
            placeholder="Notas específicas…"
            style={notesStyle}
          />
        </Accordion>

        {/* 3. Desencadenantes */}
        <Accordion number="3" title="Desencadenantes" subtitle="Estresores precipitantes recientes" hasContent={hasContent(value.triggers)}>
          <CheckboxGroup
            options={TRIGGER_OPTIONS} selected={value.triggers.selected}
            onToggle={key => setFactor('triggers', { selected: toggle(value.triggers.selected, key) })}
            disabled={disabled}
          />
          <textarea
            value={value.triggers.notes} disabled={disabled}
            onChange={e => setFactor('triggers', { notes: e.target.value })}
            placeholder="Notas específicas…"
            style={notesStyle}
          />
        </Accordion>

        {/* 4. Mantenimiento */}
        <Accordion number="4" title="Mantenimiento" subtitle="Factores que perpetúan el problema hoy" hasContent={hasContent(value.maintenance)}>
          <CheckboxGroup
            options={MAINTENANCE_OPTIONS} selected={value.maintenance.selected}
            onToggle={key => setFactor('maintenance', { selected: toggle(value.maintenance.selected, key) })}
            disabled={disabled}
          />
          <textarea
            value={value.maintenance.notes} disabled={disabled}
            onChange={e => setFactor('maintenance', { notes: e.target.value })}
            placeholder="Notas específicas…"
            style={notesStyle}
          />
        </Accordion>

        {/* 5. Protección */}
        <Accordion number="5" title="Protección" subtitle="Recursos y fortalezas a favor" hasContent={hasContent(value.protection)}>
          <CheckboxGroup
            options={PROTECTION_OPTIONS} selected={value.protection.selected}
            onToggle={key => setFactor('protection', { selected: toggle(value.protection.selected, key) })}
            disabled={disabled}
          />
          <textarea
            value={value.protection.notes} disabled={disabled}
            onChange={e => setFactor('protection', { notes: e.target.value })}
            placeholder="Notas específicas…"
            style={notesStyle}
          />
        </Accordion>

      </div>
    </div>
  );
}
