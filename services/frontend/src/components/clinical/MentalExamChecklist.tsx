// VI. EXAMEN MENTAL EN CONSULTA — fiel al Formato 1 Sesión Inicial
// Opciones exactas del documento; multi-select donde el formato tiene checkboxes.

export interface MentalExam {
  porte: string[];             // adecuado | colaborador | ansioso | hostil | inhibido
  orientacion: string;         // 'orientado' | 'desorientado' | ''
  orientacion_areas: string[]; // tiempo | espacio | persona
  afecto: string[];            // eutimico | depresivo | ansioso | irritable | aplanado
  pensamiento: string[];       // logico_coherente | ideas_minusvalia | ideas_obsesivas | ideas_delirantes
  percepcion: string;          // 'sin_alteraciones' | 'alucinaciones' | ''
  percepcion_spec: string;
  suicidal_ideation: string;   // 'ausente' | 'pasiva' | 'activa_con_plan' | ''
  prior_attempt: boolean | null;
}

export function defaultMentalExam(): MentalExam {
  return {
    porte: [],
    orientacion: '',
    orientacion_areas: [],
    afecto: [],
    pensamiento: [],
    percepcion: '',
    percepcion_spec: '',
    suicidal_ideation: '',
    prior_attempt: null,
  };
}

const PORTE_OPTIONS = [
  { key: 'adecuado', label: 'Adecuado' },
  { key: 'colaborador', label: 'Colaborador' },
  { key: 'ansioso', label: 'Ansioso' },
  { key: 'hostil', label: 'Hostil' },
  { key: 'inhibido', label: 'Inhibido' },
];

const AFECTO_OPTIONS = [
  { key: 'eutimico', label: 'Eutímico (Estable)' },
  { key: 'depresivo', label: 'Depresivo' },
  { key: 'ansioso', label: 'Ansioso' },
  { key: 'irritable', label: 'Irritable' },
  { key: 'aplanado', label: 'Aplanado' },
];

const PENSAMIENTO_OPTIONS = [
  { key: 'logico_coherente', label: 'Lógico / Coherente' },
  { key: 'ideas_minusvalia', label: 'Ideas de minusvalía' },
  { key: 'ideas_obsesivas', label: 'Ideas obsesivas' },
  { key: 'ideas_delirantes', label: 'Ideas delirantes' },
];

function toggle(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

function Chips({
  label,
  options,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (k: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
        {label}
      </p>
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
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  value: MentalExam;
  onChange: (v: MentalExam) => void;
  disabled?: boolean;
}

const SUICIDAL_IDEATION_OPTIONS = [
  { key: 'ausente', label: 'Ausente' },
  { key: 'pasiva', label: 'Pasiva (deseos de morir)' },
  { key: 'activa_con_plan', label: 'Activa con plan estructurado' },
];

export function MentalExamChecklist({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<MentalExam>) => onChange({ ...value, ...patch });

  return (
    <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
        VI. EXAMEN MENTAL EN CONSULTA
      </p>

      {/* Porte y Actitud */}
      <Chips
        label="• Porte y Actitud"
        options={PORTE_OPTIONS}
        selected={value.porte}
        onToggle={k => set({ porte: toggle(value.porte, k) })}
        disabled={disabled}
      />

      {/* Orientación */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          • Orientación
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {(['orientado', 'desorientado'] as const).map(opt => {
            const active = value.orientacion === opt;
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => set({ orientacion: active ? '' : opt, orientacion_areas: [] })}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1.5px solid ${active ? 'var(--teal)' : 'var(--s200)'}`,
                  background: active ? 'var(--teal)' : '#fff',
                  color: active ? '#fff' : 'var(--s600)',
                }}
              >
                {opt === 'orientado' ? 'Orientado globalmente' : 'Desorientado en:'}
              </button>
            );
          })}
        </div>
        {value.orientacion === 'desorientado' && (
          <div style={{ display: 'flex', gap: 6, paddingLeft: 8 }}>
            {(['tiempo', 'espacio', 'persona'] as const).map(area => {
              const active = value.orientacion_areas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  disabled={disabled}
                  onClick={() => set({ orientacion_areas: toggle(value.orientacion_areas, area) })}
                  style={{
                    padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 500,
                    cursor: disabled ? 'default' : 'pointer',
                    border: `1.5px solid ${active ? '#f59e0b' : 'var(--s200)'}`,
                    background: active ? '#fef3c7' : '#fff',
                    color: active ? '#92400e' : 'var(--s600)',
                  }}
                >
                  {area.charAt(0).toUpperCase() + area.slice(1)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Afecto */}
      <Chips
        label="• Afecto"
        options={AFECTO_OPTIONS}
        selected={value.afecto}
        onToggle={k => set({ afecto: toggle(value.afecto, k) })}
        disabled={disabled}
      />

      {/* Pensamiento */}
      <Chips
        label="• Pensamiento"
        options={PENSAMIENTO_OPTIONS}
        selected={value.pensamiento}
        onToggle={k => set({ pensamiento: toggle(value.pensamiento, k) })}
        disabled={disabled}
      />

      {/* Percepción */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          • Percepción
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {([
            { key: 'sin_alteraciones', label: 'Sin alteraciones' },
            { key: 'alucinaciones', label: 'Alucinaciones' },
          ] as const).map(opt => {
            const active = value.percepcion === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled}
                onClick={() => set({ percepcion: active ? '' : opt.key, percepcion_spec: '' })}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1.5px solid ${active ? 'var(--teal)' : 'var(--s200)'}`,
                  background: active ? 'var(--teal)' : '#fff',
                  color: active ? '#fff' : 'var(--s600)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {value.percepcion === 'alucinaciones' && (
          <input
            type="text"
            value={value.percepcion_spec}
            disabled={disabled}
            onChange={e => set({ percepcion_spec: e.target.value })}
            placeholder="Especificar tipo y modalidad…"
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 8,
              border: '1.5px solid var(--s200)', fontSize: 12,
              color: 'var(--s700)', background: disabled ? '#f9fafb' : '#fff',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Indicadores de Riesgo */}
      <div style={{ borderTop: '1px solid var(--s100)', paddingTop: 10 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          • Indicadores de Riesgo
        </p>

        <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--s500)' }}>Ideación Suicida:</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {SUICIDAL_IDEATION_OPTIONS.map(opt => {
            const active = value.suicidal_ideation === opt.key;
            const isRisk = opt.key !== 'ausente';
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled}
                onClick={() => set({ suicidal_ideation: active ? '' : opt.key })}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1.5px solid ${active ? (isRisk ? '#dc2626' : 'var(--teal)') : 'var(--s200)'}`,
                  background: active ? (isRisk ? '#fee2e2' : 'var(--teal)') : '#fff',
                  color: active ? (isRisk ? '#991b1b' : '#fff') : 'var(--s600)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--s500)' }}>Antecedente de intento previo:</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {([{ v: true, label: 'SÍ' }, { v: false, label: 'NO' }] as const).map(opt => {
            const active = value.prior_attempt === opt.v;
            return (
              <button
                key={opt.label}
                type="button"
                disabled={disabled}
                onClick={() => set({ prior_attempt: active ? null : opt.v })}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1.5px solid ${active ? (opt.v ? '#dc2626' : 'var(--teal)') : 'var(--s200)'}`,
                  background: active ? (opt.v ? '#fee2e2' : 'var(--teal)') : '#fff',
                  color: active ? (opt.v ? '#991b1b' : '#fff') : 'var(--s600)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
