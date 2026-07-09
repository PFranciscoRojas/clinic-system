import { useMemo, useState } from 'react';

// Three explicit selects (Año / Mes / Día) instead of a native <input type="date">,
// whose placeholder order depended on the browser locale and was confusing.
//
// The selects keep their own partial state so a year/month can be picked
// before the others — the ISO value is only emitted to the parent once all
// three are set (empty otherwise). Partial dates are therefore impossible
// to save, but selecting one field at a time works naturally.

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

function daysInMonth(y: number, m: number): number {
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

export function BirthDateField({ value, onChange, error }: Props) {
  // Local partial state — the source of truth for the three selects,
  // seeded from the incoming ISO (e.g. editing an existing patient).
  const [iy = '', im = '', id = ''] = (value || '').split('-');
  const [y, setY] = useState(iy);
  const [m, setM] = useState(im ? String(Number(im)) : '');
  const [d, setD] = useState(id ? String(Number(id)) : '');

  // Sync from the parent value (e.g. editing an existing patient), adjusting
  // state during render (no effect → no extra paint). Only when the incoming
  // ISO changed since the last render AND differs from what the selects
  // represent, so it never fights the user mid-selection.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const iso = y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '';
    if (value !== iso) {
      const [py = '', pm = '', pd = ''] = (value || '').split('-');
      setY(py);
      setM(pm ? String(Number(pm)) : '');
      setD(pd ? String(Number(pd)) : '');
    }
  }

  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const maxDay = daysInMonth(Number(y), Number(m));
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const commit = (ny: string, nm: string, nd: string) => {
    setY(ny); setM(nm); setD(nd);
    if (ny && nm && nd) {
      const dim = daysInMonth(Number(ny), Number(nm));
      const day = Math.min(Number(nd), dim);
      onChange(`${ny}-${nm.padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    } else {
      onChange('');
    }
  };

  const selStyle: React.CSSProperties = {
    padding: '9px 10px', borderRadius: 9, fontSize: 13, color: 'var(--s800)',
    border: `1.5px solid ${error ? '#ef4444' : 'var(--s200)'}`, background: '#fff', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 0.9fr', gap: 8 }}>
      <select aria-label="Año" value={y} onChange={e => commit(e.target.value, m, d)} style={selStyle}>
        <option value="">Año</option>
        {years.map(yr => <option key={yr} value={String(yr)}>{yr}</option>)}
      </select>
      <select aria-label="Mes" value={m} onChange={e => commit(y, e.target.value, d)} style={selStyle}>
        <option value="">Mes</option>
        {MONTHS.map((name, i) => <option key={name} value={String(i + 1)}>{name}</option>)}
      </select>
      <select aria-label="Día" value={d} onChange={e => commit(y, m, e.target.value)} style={selStyle}>
        <option value="">Día</option>
        {days.map(dd => <option key={dd} value={String(dd)}>{dd}</option>)}
      </select>
    </div>
  );
}
