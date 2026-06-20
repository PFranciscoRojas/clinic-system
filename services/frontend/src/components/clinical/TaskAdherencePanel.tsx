import type { TaskAdherenceData } from './constants';

interface Props {
  value: TaskAdherenceData;
  onChange: (v: TaskAdherenceData) => void;
  disabled?: boolean;
}

const LEVELS = [
  { key: 'full', label: 'Cumplió totalmente', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
  { key: 'partial', label: 'Cumplió parcialmente', color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  { key: 'none', label: 'No cumplió', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
] as const;

// Seguimiento a compromisos de sesión anterior (Formato 3, sección II).
export function TaskAdherencePanel({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<TaskAdherenceData>) => onChange({ ...value, ...patch });

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--s100)', background: '#fafafa', padding: '12px 14px' }}>
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
        II. Seguimiento a tareas de sesión anterior
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--s600)' }}>¿Se asignaron tareas?</span>
        {(['yes', 'no'] as const).map(v => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: 'var(--s700)' }}>
            <input
              type="radio" name="adherence-assigned" disabled={disabled}
              checked={v === 'yes' ? value.assigned : !value.assigned}
              onChange={() => set({ assigned: v === 'yes', level: v === 'no' ? '' : value.level })}
              style={{ accentColor: 'var(--teal)' }}
            />
            {v === 'yes' ? 'Sí' : 'No'}
          </label>
        ))}
      </div>

      {value.assigned && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {LEVELS.map(level => {
              const active = value.level === level.key;
              return (
                <button
                  key={level.key} type="button" disabled={disabled}
                  onClick={() => set({ level: level.key })}
                  style={{
                    padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                    cursor: disabled ? 'default' : 'pointer',
                    border: `1.5px solid ${active ? 'transparent' : level.border}`,
                    background: active ? level.border : level.bg,
                    color: level.color,
                  }}
                >{level.label}</button>
              );
            })}
          </div>
          <textarea
            value={value.observations} disabled={disabled}
            onChange={e => set({ observations: e.target.value })}
            placeholder="Observaciones — ¿qué dificultades encontró o qué descubrió al hacer la tarea?…"
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--s200)',
              fontSize: 13, color: 'var(--s700)', resize: 'vertical', minHeight: 60,
              boxSizing: 'border-box', background: '#fff',
            }}
          />
        </>
      )}
    </div>
  );
}
