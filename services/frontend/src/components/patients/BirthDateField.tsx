import { useMemo } from 'react';

// Three explicit selects (Año / Mes / Día) instead of a native <input type="date">,
// whose placeholder order depends on the browser locale and was confusing
// (it suggested mm/dd/yyyy while validation expected another order). Here the
// order is fixed and unambiguous, and partial dates are impossible.

interface Props {
  /** ISO value "YYYY-MM-DD" or "". */
  value: string;
  onChange: (iso: string) => void;
  error?: string | boolean;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function parse(value: string): { y: string; m: string; d: string } {
  const [y = '', m = '', d = ''] = value.split('-');
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

export function BirthDateField({ value, onChange, error }: Props) {
  const { y, m, d } = parse(value);
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const maxDay = daysInMonth(Number(y), Number(m));
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const emit = (ny: string, nm: string, nd: string) => {
    if (!ny || !nm || !nd) { onChange(''); return; }
    // Clamp the day if the new month/year is shorter (e.g. 31 → Feb)
    const dim = daysInMonth(Number(ny), Number(nm));
    const day = Math.min(Number(nd), dim);
    onChange(`${ny}-${nm.padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  const selStyle: React.CSSProperties = {
    padding: '9px 10px', borderRadius: 9, fontSize: 13, color: 'var(--s800)',
    border: `1.5px solid ${error ? '#ef4444' : 'var(--s200)'}`, background: '#fff', cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 0.9fr', gap: 8 }}>
        <select aria-label="Año" value={y} onChange={e => emit(e.target.value, m, d || '1')} style={selStyle}>
          <option value="">Año</option>
          {years.map(yr => <option key={yr} value={String(yr)}>{yr}</option>)}
        </select>
        <select aria-label="Mes" value={m ? String(Number(m)) : ''} onChange={e => emit(y, e.target.value, d || '1')} style={selStyle}>
          <option value="">Mes</option>
          {MONTHS.map((name, i) => <option key={name} value={String(i + 1)}>{name}</option>)}
        </select>
        <select aria-label="Día" value={d ? String(Number(d)) : ''} onChange={e => emit(y, m, e.target.value)} style={selStyle} disabled={!y || !m}>
          <option value="">Día</option>
          {days.map(dd => <option key={dd} value={String(dd)}>{dd}</option>)}
        </select>
      </div>
    </div>
  );
}
