import {
  PHYSIOLOGICAL_RESPONSE_OPTIONS,
  MOTOR_RESPONSE_OPTIONS,
  CONSEQUENCE_OPTIONS,
  type FunctionalAnalysisData,
} from './constants';
import { AutoGrowTextarea } from './AutoGrowTextarea';

interface Props {
  value: FunctionalAnalysisData;
  onChange: (v: FunctionalAnalysisData) => void;
  disabled?: boolean;
}

function CheckGroup({
  options,
  selected,
  other,
  onToggle,
  onOther,
  otherPlaceholder,
  disabled,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  other: string;
  onToggle: (key: string) => void;
  onOther: (v: string) => void;
  otherPlaceholder: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const active = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(opt.key)}
            style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
              cursor: disabled ? 'default' : 'pointer',
              border: `1.5px solid ${active ? 'var(--teal)' : 'var(--s200)'}`,
              background: active ? 'var(--teal)' : '#fff',
              color: active ? '#fff' : 'var(--s600)',
            }}
          >{opt.label}</button>
        );
      })}
      <input
        type="text"
        value={other}
        disabled={disabled}
        onChange={e => onOther(e.target.value)}
        placeholder={otherPlaceholder}
        style={{
          flex: '1 1 160px', minWidth: 120, border: '1.5px solid var(--s200)',
          borderRadius: 8, padding: '4px 10px', fontSize: 12, color: 'var(--s700)',
          background: disabled ? '#f9fafb' : '#fff',
        }}
      />
    </div>
  );
}

function toggle(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

export function FunctionalAnalysisPanel({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<FunctionalAnalysisData>) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Antecedentes */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          Antecedentes — ¿Qué dispara el malestar?
        </p>
        <AutoGrowTextarea
          value={value.antecedents}
          disabled={disabled}
          minRows={2}
          onChange={e => set({ antecedents: e.target.value })}
          placeholder="Contexto, situaciones, personas, lugares o pensamientos previos…"
        />
      </div>

      {/* Cognitiva */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          Respuesta cognitiva — ¿Qué piensa, qué se dice a sí mismo, qué imágenes aparecen?
        </p>
        <AutoGrowTextarea
          value={value.cognitive_response}
          disabled={disabled}
          minRows={2}
          onChange={e => set({ cognitive_response: e.target.value })}
          placeholder="Pensamientos automáticos, imágenes mentales…"
        />
      </div>

      {/* Fisiológica */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          Respuesta fisiológica — ¿Qué siente en el cuerpo?
        </p>
        <CheckGroup
          options={PHYSIOLOGICAL_RESPONSE_OPTIONS}
          selected={value.physiological_response}
          other={value.physiological_other}
          onToggle={k => set({ physiological_response: toggle(value.physiological_response, k) })}
          onOther={v => set({ physiological_other: v })}
          otherPlaceholder="Otra…"
          disabled={disabled}
        />
      </div>

      {/* Motora */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          Respuesta motora — ¿Qué hace o deja de hacer concretamente?
        </p>
        <CheckGroup
          options={MOTOR_RESPONSE_OPTIONS}
          selected={value.motor_response}
          other={value.motor_other}
          onToggle={k => set({ motor_response: toggle(value.motor_response, k) })}
          onOther={v => set({ motor_other: v })}
          otherPlaceholder="Otra…"
          disabled={disabled}
        />
      </div>

      {/* Consecuencias */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          Consecuencias — ¿Qué pasa justo después?
        </p>
        <CheckGroup
          options={CONSEQUENCE_OPTIONS}
          selected={value.consequences}
          other={value.consequences_other}
          onToggle={k => set({ consequences: toggle(value.consequences, k) })}
          onOther={v => set({ consequences_other: v })}
          otherPlaceholder="Otra…"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
