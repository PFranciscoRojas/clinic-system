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
import { RiskSelector } from './RiskSelector';
import { TreatmentPlanPanel } from './TreatmentPlanPanel';
import { DiagnosesPanel } from './DiagnosesPanel';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { useAuth } from '@/context/AuthContext';
import type {
  SPAHistoryData, FamilyMentalHealthData,
  Formulation5FData, FunctionalAnalysisData,
  TaskAdherenceData, SessionEvalData, FunctionalityData,
} from './constants';
import type { RiskLevel } from '@/api/clinicalRecords';

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

/** TemplatedSectionsForm renders a dynamic form from a parsed template schema. */
export default function TemplatedSectionsForm({ schema, value, onChange, disabled, patientId }: Props) {
  const { user } = useAuth();
  const canAddDiagnosis = (user?.permissions ?? []).includes('clinical_records:create');
  const canUpdateDiagnosisStatus = (user?.permissions ?? []).includes('clinical_records:update');
  return (
    <div className="space-y-6">
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

function SectionField({ def, value, onChange, disabled, patientId, canAddDiagnosis, canUpdateDiagnosisStatus }: FieldProps) {
  // Widget components manage their own internal layout (and, where it makes
  // sense, their own collapse state — see TaskChecklist) — wrapping them in a
  // second accordion here would double up the toggle. The generic accordion
  // below is only for the plain field types (text/select/scale/checklist).
  const [open, setOpen] = useState(!def.collapsed || def.type === 'widget');

  const label = (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {def.label}
      {def.required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );

  if (def.type !== 'widget' && def.collapsed) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {def.label}
          {def.required && <span className="text-red-500 ml-1">*</span>}
        </button>
        {open && (
          <>
            {def.hint && <p className="text-xs text-gray-400 mb-1">{def.hint}</p>}
            <FieldInput def={def} value={value} onChange={onChange} disabled={disabled} patientId={patientId} canAddDiagnosis={canAddDiagnosis} canUpdateDiagnosisStatus={canUpdateDiagnosisStatus} />
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {label}
      {def.hint && <p className="text-xs text-gray-400 mb-1">{def.hint}</p>}
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
          className="w-full rounded border-gray-300 text-sm"
          minRows={3}
        />
      );

    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded border-gray-300 text-sm"
        >
          <option value="">— Seleccionar —</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'scale': {
      const min = def.scale_min ?? 0;
      const max = def.scale_max ?? 10;
      const num = typeof value === 'number' ? value : min;
      return (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{min}</span>
          <input
            type="range"
            min={min}
            max={max}
            value={num}
            disabled={disabled}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs text-gray-500">{max}</span>
          <span className="w-8 text-center font-semibold text-sm">{num}</span>
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
    <div className="space-y-1">
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{item}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder={placeholder ?? 'Agregar ítem y presionar Enter'}
            className="flex-1 rounded border-gray-300 text-sm"
          />
          <button
            type="button"
            onClick={add}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
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
      return (
        <RiskSelector
          value={(typeof v === 'string' ? v : '') as RiskLevel | undefined}
          onChange={cb}
          disabled={disabled}
        />
      );
    case 'treatment_plan':
      // TreatmentPlanPanel is self-contained (loads/saves its own data).
      if (!patientId) return <p className="text-xs text-gray-400">Plan de tratamiento (requiere paciente)</p>;
      return <TreatmentPlanPanel patientId={patientId} />;
    case 'diagnoses':
      // DiagnosesPanel is self-contained (loads/saves its own data).
      if (!patientId) return <p className="text-xs text-gray-400">Diagnósticos (requiere paciente)</p>;
      return <DiagnosesPanel patientId={patientId} canAdd={canAddDiagnosis} canUpdateStatus={canUpdateDiagnosisStatus} />;
    default:
      return (
        <div className="text-xs text-amber-600 p-2 border border-amber-200 rounded">
          Widget desconocido: <code>{name}</code>
        </div>
      );
  }
}
