import { DISTRESS_LABELS } from './constants';

interface Props {
  value?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

// Nivel de malestar subjetivo 1-10 — appears at the top of INITIAL and EVOLUTION
// forms. The professional clicks the circle; the selected cell turns teal.
export function SubjectiveDistressScale({ value, onChange, disabled }: Props) {
  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const colorFor = (n: number) => {
    if (n <= 3) return { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46', activeBg: '#059669' };
    if (n <= 6) return { bg: '#fef3c7', border: '#fde68a', text: '#92400e', activeBg: '#d97706' };
    return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', activeBg: '#dc2626' };
  };

  return (
    <div style={{ marginBottom: 4 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
        Nivel de malestar subjetivo (SUDS 1-10)
      </p>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {levels.map(n => {
          const active = value === n;
          const c = colorFor(n);
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              title={DISTRESS_LABELS[n]}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: `1.5px solid ${active ? 'transparent' : c.border}`,
                background: active ? c.activeBg : c.bg,
                color: active ? '#fff' : c.text,
                fontSize: 13, fontWeight: 700,
                cursor: disabled ? 'default' : 'pointer',
                transition: 'all 0.1s',
              }}
            >{n}</button>
          );
        })}
      </div>
      {value !== undefined && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--s400)' }}>
          {value}/10 — {DISTRESS_LABELS[value]}
        </p>
      )}
    </div>
  );
}
