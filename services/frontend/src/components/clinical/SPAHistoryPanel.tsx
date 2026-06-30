import type { SPAHistoryData, FamilyMentalHealthData } from './constants';

interface Props {
  spa: SPAHistoryData;
  familyMH: FamilyMentalHealthData;
  onSPAChange: (v: SPAHistoryData) => void;
  onFamilyMHChange: (v: FamilyMentalHealthData) => void;
  disabled?: boolean;
}

function PillToggle({ value, onChange, disabled }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {([{ v: true, label: 'Sí' }, { v: false, label: 'No' }] as const).map(opt => {
        const active = value === opt.v;
        return (
          <button
            key={opt.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.v)}
            style={{
              padding: '5px 16px', borderRadius: 16, fontSize: 13, fontWeight: 600,
              cursor: disabled ? 'default' : 'pointer',
              border: `1.5px solid ${active ? 'var(--teal)' : 'var(--s200)'}`,
              background: active ? 'var(--teal)' : '#fff',
              color: active ? '#fff' : 'var(--s600)',
              transition: 'all 0.15s',
            }}
          >{opt.label}</button>
        );
      })}
    </div>
  );
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

export function SPAHistoryPanel({ spa: rawSpa, familyMH, onSPAChange, onFamilyMHChange, disabled }: Props) {
  // Guarantee nested objects are always defined regardless of data source
  // (old localStorage drafts may have saved spaHistory without alcohol/tobacco/other).
  const spa: SPAHistoryData = {
    present: rawSpa?.present ?? false,
    alcohol: Object.assign({ present: false, frequency: '' },                rawSpa?.alcohol ?? {}),
    tobacco: Object.assign({ present: false, frequency: '' },                rawSpa?.tobacco ?? {}),
    other:   Object.assign({ present: false, substance: '', frequency: '' }, rawSpa?.other   ?? {}),
  };
  const setSPA = (patch: Partial<SPAHistoryData>) => onSPAChange({ ...spa, ...patch });
  const setFMH = (patch: Partial<FamilyMentalHealthData>) => onFamilyMHChange({ ...familyMH, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Consumo de SPA */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
            Consumo de SPA:
          </p>
          <PillToggle value={spa.present} onChange={v => setSPA({ present: v })} disabled={disabled} />
        </div>

        {spa.present && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 4 }}>
            {/* Alcohol */}
            <div style={substanceRowStyle}>
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
            <div style={substanceRowStyle}>
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
            <div style={substanceRowStyle}>
              <Checkbox
                id="spa-other" checked={spa.other.present}
                onChange={v => setSPA({ other: { ...spa.other, present: v } })}
                label="Otras Sustancias" disabled={disabled}
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
        )}
      </div>

      {/* Antecedentes familiares SM */}
      <div>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          Antecedentes Familiares en Salud Mental:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Checkbox id="fmh-anxiety" checked={familyMH.anxiety} onChange={v => setFMH({ anxiety: v })} label="Ansiedad" disabled={disabled} />
          <Checkbox id="fmh-depression" checked={familyMH.depression} onChange={v => setFMH({ depression: v })} label="Depresión" disabled={disabled} />
          <Checkbox id="fmh-suicide" checked={familyMH.suicide} onChange={v => setFMH({ suicide: v })} label="Suicidio" disabled={disabled} />
          <Checkbox id="fmh-psychosis" checked={familyMH.psychosis} onChange={v => setFMH({ psychosis: v })} label="Psicosis" disabled={disabled} />
        </div>
      </div>
    </div>
  );
}

const substanceRowStyle: React.CSSProperties = {
  background: 'var(--s50, #f9fafb)',
  borderRadius: 8,
  padding: '10px 12px',
  border: '1px solid var(--s100)',
};

const inputStyle: React.CSSProperties = {
  marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--s200)', fontSize: 13, color: 'var(--s700)',
  boxSizing: 'border-box', background: '#fff',
};
