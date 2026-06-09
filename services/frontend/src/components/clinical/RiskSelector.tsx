import { ShieldAlert } from 'lucide-react';
import type { RiskLevel } from '@/api/clinicalRecords';
import { RISK_LEVELS } from './constants';

interface Props {
  value?: RiskLevel;
  onChange: (v: RiskLevel) => void;
  disabled?: boolean;
}

// Mandatory one-click risk assessment — the practitioner's primary legal
// protection. No default: the professional must consciously pick a level.
export function RiskSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="card" style={{ padding: '16px 20px', border: value ? undefined : '1.5px solid #fde68a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <ShieldAlert size={15} color={value ? 'var(--s500)' : '#d97706'} />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
          Riesgo suicida / autolesión <span style={{ color: '#dc2626' }}>*</span>
        </p>
        {!value && <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>Obligatorio en cada nota</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {RISK_LEVELS.map(r => {
          const active = value === r.value;
          return (
            <button
              key={r.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(r.value)}
              style={{
                padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                cursor: disabled ? 'default' : 'pointer',
                border: `1.5px solid ${active ? r.border : 'var(--s200)'}`,
                background: active ? r.bg : '#fff',
                color: active ? r.color : 'var(--s500)',
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
