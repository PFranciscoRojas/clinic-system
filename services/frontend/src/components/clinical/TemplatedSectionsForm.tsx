/**
 * TemplatedSectionsForm — data-driven form renderer for custom record templates.
 *
 * Renders a form section for each SectionDef in the template schema:
 *   - text/checklist → generic textarea / tag list
 *   - select → dropdown
 *   - scale → slider
 *   - widget → the existing clinical component (MentalExamChecklist, etc.)
 *
 * When template_id is null/undefined, callers should render the integrated
 * RecordSectionsForm instead (the existing hardcoded layout).
 *
 * Styling: this app has no Tailwind — everything is inline styles over the
 * CSS variables from global.css plus the `.card` class, mirroring the look
 * of the integrated RecordSectionsForm so both formats feel like the same
 * product.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SectionDef } from '../../api/recordTemplates';
import type { RecordSections } from '../../api/clinicalRecords';

// Existing widget components — named exports, imported directly.
import { MentalExamChecklist, type MentalExam } from './MentalExamChecklist';
import { ClinicalFormulation5F } from './ClinicalFormulation5F';
import { FunctionalAnalysisPanel } from './FunctionalAnalysisPanel';
import { SubjectiveDistressScale } from './SubjectiveDistressScale';
import { TaskChecklist } from './TaskChecklist';
import { TaskAdherencePanel } from './TaskAdherencePanel';
import { SessionEvaluationPanel } from './SessionEvaluationPanel';
import { FunctionalityPanel } from './FunctionalityPanel';
import { SPAHistoryPanel } from './SPAHistoryPanel';
import { TreatmentPlanPanel } from './TreatmentPlanPanel';
import { DiagnosesPanel } from './DiagnosesPanel';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { useAuth } from '@/context/AuthContext';
import type {
  SPAHistoryData, FamilyMentalHealthData,
  Formulation5FData, FunctionalAnalysisData,
  TaskAdherenceData, SessionEvalData, FunctionalityData,
} from './constants';

// SectionsState is a superset of RecordSections — the same flexible dict shape.
export type SectionsState = RecordSections;

interface Props {
  schema: SectionDef[];
  value: SectionsState;
  onChange: (updated: SectionsState) => void;
  disabled?: boolean;
  patientId?: string;
}

function set(state: SectionsState, key: string, val: RecordSections[string]): SectionsState {
  return { ...state, [key]: val };
}

// Widgets that already render their own card container (white bg, radius,
// shadow) — wrapping them in another card would double the chrome.
const SELF_CONTAINED_WIDGETS = new Set([
  'mental_exam', 'formulation_5f', 'task_checklist', 'risk', 'treatment_plan', 'diagnoses',
]);

/** TemplatedSectionsForm renders a dynamic form from a parsed template schema. */
export default function TemplatedSectionsForm({ schema, value, onChange, disabled, patientId }: Props) {
  const { user } = useAuth();
  const canAddDiagnosis = (user?.permissions ?? []).includes('clinical_records:create');
  const canUpdateDiagnosisStatus = (user?.permissions ?? []).includes('clinical_records:update');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {schema.map((sec) => (
        <SectionField
          key={sec.key}
          def={sec}
          value={value[sec.key]}
          onChange={(v) => onChange(set(value, sec.key, v))}
          disabled={disabled}
          patientId={patientId}
          canAddDiagnosis={canAddDiagnosis}
          canUpdateDiagnosisStatus={canUpdateDiagnosisStatus}
        />
      ))}
    </div>
  );
}

interface FieldProps {
  def: SectionDef;
  value: RecordSections[string];
  onChange: (v: RecordSections[string]) => void;
  disabled?: boolean;
  patientId?: string;
  canAddDiagnosis: boolean;
  canUpdateDiagnosisStatus: boolean;
}

function FieldLabel({ def }: { def: SectionDef }) {
  return (
    <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
      {def.label}
      {def.required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
    </p>
  );
}

function SectionField({ def, value, onChange, disabled, patientId, canAddDiagnosis, canUpdateDiagnosisStatus }: FieldProps) {
  // Widget components manage their own internal layout (and, where it makes
  // sense, their own collapse state — see TaskChecklist) — wrapping them in a
  // second accordion here would double up the toggle. The generic accordion
  // below is only for the plain field types (text/select/scale/checklist).
  const [open, setOpen] = useState(!def.collapsed || def.type === 'widget');

  if (def.type === 'widget') {
    const widget = (
      <WidgetField
        name={def.widget ?? ''}
        value={value}
        onChange={onChange}
        disabled={disabled}
        patientId={patientId}
        canAddDiagnosis={canAddDiagnosis}
        canUpdateDiagnosisStatus={canUpdateDiagnosisStatus}
      />
    );
    // Self-contained widgets bring their own card + title; render them bare.
    if (SELF_CONTAINED_WIDGETS.has(def.widget ?? '')) return widget;
    return (
      <div className="card" style={{ padding: '20px 24px' }}>
        <FieldLabel def={def} />
        {widget}
      </div>
    );
  }

  if (def.collapsed) {
    return (
      <div className="card" style={{ padding: '16px 24px' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--s700)',
            width: '100%', textAlign: 'left',
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {def.label}
          {def.required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
        </button>
        {open && (
          <div style={{ marginTop: 10 }}>
            {def.hint && def.type !== 'text' && (
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--s400)' }}>{def.hint}</p>
            )}
            <FieldInput def={def} value={value} onChange={onChange} disabled={disabled} patientId={patientId} canAddDiagnosis={canAddDiagnosis} canUpdateDiagnosisStatus={canUpdateDiagnosisStatus} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <FieldLabel def={def} />
      {/* Text fields already surface the hint as their placeholder. */}
      {def.hint && def.type !== 'text' && (
        <p style={{ margin: '-4px 0 8px', fontSize: 12, color: 'var(--s400)' }}>{def.hint}</p>
      )}
      <FieldInput def={def} value={value} onChange={onChange} disabled={disabled} patientId={patientId} canAddDiagnosis={canAddDiagnosis} canUpdateDiagnosisStatus={canUpdateDiagnosisStatus} />
    </div>
  );
}

function FieldInput({ def, value, onChange, disabled, patientId, canAddDiagnosis, canUpdateDiagnosisStatus }: FieldProps) {
  switch (def.type) {
    case 'text':
      return (
        <AutoGrowTextarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={def.hint}
          minRows={3}
        />
      );

    case 'select':
      if (def.display === 'pills') {
        const current = typeof value === 'string' && value ? [value] : [];
        return (
          <PillGroup
            options={def.options ?? []}
            value={current}
            multi={false}
            onChange={(v) => onChange(v[0] ?? '')}
            disabled={disabled}
          />
        );
      }
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: '100%', maxWidth: 360, padding: '8px 10px', borderRadius: 8, fontSize: 13,
            border: '1.5px solid var(--s200)', color: 'var(--s700)',
            background: disabled ? '#f9fafb' : '#fff',
          }}
        >
          <option value="">— Seleccionar —</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'multiselect':
      return (
        <MultiselectField
          def={def}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case 'scale': {
      const min = def.scale_min ?? 0;
      const max = def.scale_max ?? 10;
      const num = typeof value === 'number' ? value : min;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--s500)' }}>{min}</span>
          <input
            type="range"
            min={min}
            max={max}
            value={num}
            disabled={disabled}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--teal)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--s500)' }}>{max}</span>
          <span style={{ width: 32, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>{num}</span>
        </div>
      );
    }

    case 'checklist': {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return (
        <ChecklistField
          items={items}
          onChange={(v) => onChange(v)}
          disabled={disabled}
          placeholder={def.hint}
        />
      );
    }

    case 'widget':
      return (
        <WidgetField
          name={def.widget ?? ''}
          value={value}
          onChange={onChange}
          disabled={disabled}
          patientId={patientId}
          canAddDiagnosis={canAddDiagnosis}
          canUpdateDiagnosisStatus={canUpdateDiagnosisStatus}
        />
      );

    default:
      return null;
  }
}

/** Toggle-pill single- or multi-select, used by select{pills} and multiselect{pills}. */
function PillGroup({
  options,
  value,
  multi,
  onChange,
  disabled,
}: {
  options: string[];
  value: string[];
  multi: boolean;
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (opt: string) => {
    if (multi) {
      onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
    } else {
      onChange(value.includes(opt) ? [] : [opt]);
    }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <button
            key={opt} type="button" disabled={disabled}
            onClick={() => toggle(opt)}
            style={{
              padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
              cursor: disabled ? 'default' : 'pointer',
              border: `1.5px solid ${active ? 'transparent' : 'var(--s200)'}`,
              background: active ? 'var(--teal)' : '#fff',
              color: active ? '#fff' : 'var(--s600)',
            }}
          >{opt}</button>
        );
      })}
    </div>
  );
}

/** Fixed-option multiselect: checkboxes (or pills), plus an optional free-text "other" row. */
function MultiselectField({
  def,
  value,
  onChange,
  disabled,
}: {
  def: SectionDef;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const options = def.options ?? [];
  const [draft, setDraft] = useState('');

  if (def.display === 'pills') {
    return <PillGroup options={options} value={value} multi onChange={onChange} disabled={disabled} />;
  }

  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  const customValues = value.filter((v) => !options.includes(v));

  const addOther = () => {
    const t = draft.trim();
    if (t) {
      onChange([...value, t]);
      setDraft('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {options.map((opt) => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
            <input
              type="checkbox" checked={value.includes(opt)} disabled={disabled}
              onChange={() => toggle(opt)}
              style={{ cursor: disabled ? 'default' : 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--s700)' }}>{opt}</span>
          </label>
        ))}
      </div>
      {def.allow_other && (
        <>
          {customValues.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {customValues.map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--s50, #faf7ef)', border: '1px solid var(--s100)', borderRadius: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--s700)' }}>{item}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onChange(value.filter((v) => v !== item))}
                      aria-label={`Quitar ${item}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!disabled && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={draft}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.preventDefault(), addOther())}
                placeholder="Otra (especificar)…"
                style={{
                  flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 8, fontSize: 13,
                  border: '1.5px solid var(--s200)', color: 'var(--s700)', background: '#fff',
                }}
              />
              <button
                type="button"
                onClick={addOther}
                aria-label="Agregar otra"
                style={{
                  padding: '7px 16px', background: 'var(--teal)', color: '#fff', border: 'none',
                  borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, flexShrink: 0,
                }}
              >
                +
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChecklistField({
  items,
  onChange,
  disabled,
  placeholder,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (t) {
      onChange([...items, t]);
      setDraft('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--s50, #faf7ef)', border: '1px solid var(--s100)', borderRadius: 8 }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--s700)' }}>{item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${item}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder={placeholder ?? 'Agregar ítem y presionar Enter'}
            style={{
              flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid var(--s200)', color: 'var(--s700)', background: '#fff',
            }}
          />
          <button
            type="button"
            onClick={add}
            aria-label="Agregar ítem"
            style={{
              padding: '7px 16px', background: 'var(--teal)', color: '#fff', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

export function WidgetField({
  name,
  value,
  onChange,
  disabled,
  patientId,
  canAddDiagnosis = false,
  canUpdateDiagnosisStatus = false,
}: {
  name: string;
  value: RecordSections[string];
  onChange: (v: RecordSections[string]) => void;
  disabled?: boolean;
  patientId?: string;
  canAddDiagnosis?: boolean;
  canUpdateDiagnosisStatus?: boolean;
}) {
  // Dispatch to the existing widget components by their canonical names
  // (matching services/shared/field-widgets.json).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = value as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cb = onChange as (x: any) => void;

  switch (name) {
    case 'mental_exam':
      return (
        <MentalExamChecklist
          value={(v ?? {}) as MentalExam}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'formulation_5f':
      return (
        <ClinicalFormulation5F
          value={(v ?? {}) as Formulation5FData}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'functional_analysis':
      return (
        <FunctionalAnalysisPanel
          value={(v ?? {}) as FunctionalAnalysisData}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'distress_scale':
      return (
        <SubjectiveDistressScale
          value={typeof v === 'number' ? v : 0}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'task_checklist':
      // TaskChecklist uses 'selected' prop instead of 'value'
      return (
        <TaskChecklist
          selected={Array.isArray(v) ? v as string[] : []}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'task_adherence':
      return (
        <TaskAdherencePanel
          value={(v ?? {}) as TaskAdherenceData}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'session_evaluation':
      return (
        <SessionEvaluationPanel
          value={(v ?? {}) as SessionEvalData}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'functionality':
      return (
        <FunctionalityPanel
          value={(v ?? {}) as FunctionalityData}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'spa_history': {
      // SPAHistoryPanel uses split props: spa + familyMH
      const parsed = (v ?? {}) as { spa?: SPAHistoryData; familyMH?: FamilyMentalHealthData };
      return (
        <SPAHistoryPanel
          spa={(parsed.spa ?? {}) as SPAHistoryData}
          familyMH={(parsed.familyMH ?? {}) as FamilyMentalHealthData}
          onSPAChange={(spa) => cb({ ...parsed, spa })}
          onFamilyMHChange={(familyMH) => cb({ ...parsed, familyMH })}
          disabled={disabled}
        />
      );
    }
    case 'risk':
      // Retired (migration 000067): risk_level is a fixed system control the
      // record form always renders — showing the archived widget too would
      // put two risk selectors on screen fighting over the same field.
      return null;
    case 'treatment_plan':
      // TreatmentPlanPanel is self-contained (loads/saves its own data).
      if (!patientId) return <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)' }}>Plan de tratamiento (requiere paciente)</p>;
      return <TreatmentPlanPanel patientId={patientId} />;
    case 'diagnoses':
      // DiagnosesPanel is self-contained (loads/saves its own data).
      if (!patientId) return <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)' }}>Diagnósticos (requiere paciente)</p>;
      return <DiagnosesPanel patientId={patientId} canAdd={canAddDiagnosis} canUpdateStatus={canUpdateDiagnosisStatus} />;
    default:
      return (
        <div style={{ fontSize: 12, color: '#92400e', padding: '8px 12px', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8 }}>
          Widget desconocido: <code>{name}</code>
        </div>
      );
  }
}
