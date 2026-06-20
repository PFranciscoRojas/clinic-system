import type { SPAHistoryData, FamilyMentalHealthData } from './constants';

interface Props {
  spa: SPAHistoryData;
  familyMH: FamilyMentalHealthData;
  onSPAChange: (v: SPAHistoryData) => void;
  onFamilyMHChange: (v: FamilyMentalHealthData) => void;
  disabled?: boolean;
}

function Checkbox({ id, checked, onChange, label, disabled }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: 'var(--s700)' }}>
      <input
        type="checkbox" id={id} checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: disabled ? 'default' : 'pointer', accentColor: 'var(--teal)' }}
      />
      {label}
    </label>
  );
}

// Antecedentes relevantes estructurados — SPA + antecedentes familiares SM.
// Used only in INITIAL records (Formato 1, sección IV).
export function SPAHistoryPanel({ spa, familyMH, onSPAChange, onFamilyMHChange, disabled }: Props) {
  const setSPA = (patch: Partial<SPAHistoryData>) => onSPAChange({ ...spa, ...patch });
  const setFMH = (patch: Partial<FamilyMentalHealthData>) => onFamilyMHChange({ ...familyMH, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Consumo de SPA */}
      <div>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Consumo de sustancias (SPA)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Alcohol */}
          <div>
            <Checkbox
              id="spa-alcohol" checked={spa.alcohol.present}
              onChange={v => setSPA({ alcohol: { ...spa.alcohol, present: v } })}
              label="Alcohol" disabled={disabled}
            />
            {spa.alcohol.present && (
              <input
                value={spa.alcohol.frequency} disabled={disabled}
                onChange={e => setSPA({ alcohol: { ...spa.alcohol, frequency: e.target.value } })}
                placeholder="Frecuencia (ej: fines de semana)…"
                style={inputStyle}
              />
            )}
          </div>
          {/* Tabaco */}
          <div>
            <Checkbox
              id="spa-tobacco" checked={spa.tobacco.present}
              onChange={v => setSPA({ tobacco: { ...spa.tobacco, present: v } })}
              label="Tabaco" disabled={disabled}
            />
            {spa.tobacco.present && (
              <input
                value={spa.tobacco.frequency} disabled={disabled}
                onChange={e => setSPA({ tobacco: { ...spa.tobacco, frequency: e.target.value } })}
                placeholder="Frecuencia…"
                style={inputStyle}
              />
            )}
          </div>
          {/* Otras sustancias */}
          <div>
            <Checkbox
              id="spa-other" checked={spa.other.present}
              onChange={v => setSPA({ other: { ...spa.other, present: v } })}
              label="Otras sustancias" disabled={disabled}
            />
            {spa.other.present && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  value={spa.other.substance} disabled={disabled}
                  onChange={e => setSPA({ other: { ...spa.other, substance: e.target.value } })}
                  placeholder="¿Cuál?"
                  style={{ ...inputStyle, flex: 1, marginTop: 0 }}
                />
                <input
                  value={spa.other.frequency} disabled={disabled}
                  onChange={e => setSPA({ other: { ...spa.other, frequency: e.target.value } })}
                  placeholder="Frecuencia…"
                  style={{ ...inputStyle, flex: 1, marginTop: 0 }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Antecedentes familiares SM */}
      <div>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Antecedentes familiares en salud mental
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Checkbox id="fmh-anxiety" checked={familyMH.anxiety} onChange={v => setFMH({ anxiety: v })} label="Ansiedad" disabled={disabled} />
          <Checkbox id="fmh-depression" checked={familyMH.depression} onChange={v => setFMH({ depression: v })} label="Depresión" disabled={disabled} />
          <Checkbox id="fmh-suicide" checked={familyMH.suicide} onChange={v => setFMH({ suicide: v })} label="Suicidio" disabled={disabled} />
          <Checkbox id="fmh-psychosis" checked={familyMH.psychosis} onChange={v => setFMH({ psychosis: v })} label="Psicosis" disabled={disabled} />
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  marginTop: 6, width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--s200)', fontSize: 13, color: 'var(--s700)',
  boxSizing: 'border-box', background: '#fff',
};
