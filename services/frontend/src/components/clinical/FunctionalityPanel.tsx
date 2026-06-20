import type { FunctionalityData } from './constants';
import { FUNCTIONALITY_LEVELS, REFERRAL_DESTINATIONS } from './constants';
import type { DischargeReason } from '@/api/clinicalRecords';

interface Props {
  value: FunctionalityData;
  onChange: (v: FunctionalityData) => void;
  dischargeReason?: DischargeReason;
  disabled?: boolean;
}

// Functionality and referral destination for DISCHARGE records (Formato 4, secciones IV-II).
export function FunctionalityPanel({ value, onChange, dischargeReason, disabled }: Props) {
  const set = (patch: Partial<FunctionalityData>) => onChange({ ...value, ...patch });
  const showReferral = dischargeReason === 'REFERRAL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Nivel de funcionalidad */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
          Nivel de funcionalidad al cierre
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FUNCTIONALITY_LEVELS.map(level => {
            const active = value.level === level.key;
            return (
              <label key={level.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
                <input
                  type="radio" name="functionality-level" value={level.key} disabled={disabled}
                  checked={active}
                  onChange={() => set({ level: level.key })}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ fontSize: 13, color: 'var(--s700)' }}>{level.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Destino de remisión — solo cuando el motivo de cierre es REFERRAL */}
      {showReferral && (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>
            Destino de remisión
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REFERRAL_DESTINATIONS.map(dest => {
              const active = value.referral_destination === dest.key;
              return (
                <label key={dest.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
                  <input
                    type="radio" name="referral-destination" value={dest.key} disabled={disabled}
                    checked={active}
                    onChange={() => set({ referral_destination: dest.key })}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--s700)' }}>{dest.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
