import type { DischargeReason } from '@/api/clinicalRecords';
import { DISCHARGE_REASONS } from './constants';

// Discharge-reason selector for template-based (custom format) flows. The
// integrated DISCHARGE form carries its own richer version inside
// RecordSectionsForm (dropout session count, referral destination); custom
// templates only need the reason enum itself, which the backend requires for
// every DISCHARGE record regardless of format.
export default function DischargeReasonCard({ value, onChange, disabled }: {
  value: DischargeReason | '';
  onChange: (r: DischargeReason) => void;
  disabled?: boolean;
}) {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--s800)' }}>
        Motivo del cierre de la historia clínica <span style={{ color: '#dc2626' }}>*</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DISCHARGE_REASONS.map(r => (
          <label key={r.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
            <input
              type="radio" name="custom-discharge-reason" disabled={disabled}
              checked={value === r.value}
              onChange={() => onChange(r.value)}
              style={{ marginTop: 3, accentColor: 'var(--teal)', flexShrink: 0 }}
            />
            <span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>{r.label}: </span>
              <span style={{ fontSize: 13, color: 'var(--s500)' }}>{r.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
