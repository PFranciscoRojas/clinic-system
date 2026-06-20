import type { SessionEvalData } from './constants';
import {
  SESSION_AXIS_OPTIONS, INSIGHT_LEVELS,
  RESISTANCE_BARRIER_OPTIONS, AFFECT_EXIT_OPTIONS,
} from './constants';

interface Props {
  value: SessionEvalData;
  onChange: (v: SessionEvalData) => void;
  disabled?: boolean;
}

function toggle(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

// Session evaluation panel — combines:
//   • Session axis (eje de la sesión) — Formato 3 sección III
//   • Session closing evaluation (insight, barriers, affect) — Formato 3 sección IV
export function SessionEvaluationPanel({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<SessionEvalData>) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Eje de la sesión */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Enfoque / eje de la sesión
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SESSION_AXIS_OPTIONS.map(opt => {
            const active = value.axis.includes(opt.key);
            return (
              <button
                key={opt.key} type="button" disabled={disabled}
                onClick={() => set({ axis: toggle(value.axis, opt.key) })}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1.5px solid ${active ? 'transparent' : 'var(--s200)'}`,
                  background: active ? 'var(--teal)' : '#fff',
                  color: active ? '#fff' : 'var(--s600)',
                }}
              >{opt.label}</button>
            );
          })}
        </div>
      </div>

      {/* Feedback del consultante */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Cierre — Resonancias del consultante
        </p>
        <textarea
          value={value.patient_feedback} disabled={disabled}
          onChange={e => set({ patient_feedback: e.target.value })}
          placeholder="¿Qué se lleva del espacio? Devoluciones del consultante al cierre de la sesión…"
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--s200)',
            fontSize: 13, color: 'var(--s700)', resize: 'vertical', minHeight: 60,
            boxSizing: 'border-box', background: '#fff',
          }}
        />
      </div>

      {/* Nivel de insight */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Nivel de insight / comprensión
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {INSIGHT_LEVELS.map(level => {
            const active = value.insight === level.key;
            return (
              <button
                key={level.key} type="button" disabled={disabled}
                onClick={() => set({ insight: value.insight === level.key ? '' : level.key })}
                style={{
                  padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1.5px solid ${active ? 'transparent' : 'var(--s200)'}`,
                  background: active ? level.color : '#fff',
                  color: active ? '#fff' : 'var(--s600)',
                }}
              >{level.label}</button>
            );
          })}
        </div>
      </div>

      {/* Barreras de resistencia */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Barreras de resistencia observadas
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--s400)', marginLeft: 6 }}>(marca solo si aplica)</span>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {RESISTANCE_BARRIER_OPTIONS.map(opt => {
            const active = value.barriers.includes(opt.key);
            return (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
                <input
                  type="checkbox" checked={active} disabled={disabled}
                  onChange={() => set({ barriers: toggle(value.barriers, opt.key) })}
                  style={{ accentColor: '#dc2626', cursor: disabled ? 'default' : 'pointer' }}
                />
                <span style={{ fontSize: 12, color: 'var(--s700)' }}>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Estado del afecto al salir */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Estado del afecto al salir
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {AFFECT_EXIT_OPTIONS.map(opt => {
            const active = value.affect_exit === opt.key;
            return (
              <button
                key={opt.key} type="button" disabled={disabled}
                onClick={() => set({ affect_exit: value.affect_exit === opt.key ? '' : opt.key })}
                style={{
                  padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1.5px solid ${active ? 'transparent' : 'var(--s200)'}`,
                  background: active ? opt.color : '#fff',
                  color: active ? '#fff' : 'var(--s600)',
                }}
              >{opt.label}</button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
