import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, UserPlus } from 'lucide-react';

import { patientsApi, type Patient } from '@/api/patients';
import { Spinner } from '@/components/ui/Spinner';

function initials(p: Patient) {
  return `${p.first_name[0] ?? ''}${p.paternal_last_name[0] ?? ''}`.toUpperCase();
}

function patientFullName(p: Patient) {
  return [p.first_name, p.middle_name, p.paternal_last_name, p.maternal_last_name]
    .filter(Boolean).join(' ');
}

const avatarStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%',
  background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
  color: '#fff', fontWeight: 700, fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const badgeStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: '2px 7px',
  borderRadius: 20, flexShrink: 0,
};

interface PatientSearchBoxProps {
  selected: Patient | null;
  onSelect: (p: Patient | null) => void;
  onNewPatient: () => void;
}

export function PatientSearchBox({ selected, onSelect, onNewPatient }: PatientSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['patients-search', query],
    queryFn: () => query.length >= 2
      ? patientsApi.search({ q: query, limit: 8 })
      : patientsApi.list({ limit: 8 }),
    enabled: open,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (selected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10,
        border: '2px solid var(--teal)', background: 'var(--teal-l)',
      }}>
        <div style={avatarStyle}>{initials(selected)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {patientFullName(selected)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--s500)' }}>
            {selected.document_type_code} {selected.document_number}
          </div>
        </div>
        <button
          onClick={() => onSelect(null)}
          style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--s500)' }}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 10,
        border: '1.5px solid var(--s200)', background: '#fff',
        boxShadow: open ? '0 0 0 3px rgba(42,39,105,0.15)' : 'none',
        transition: 'box-shadow 0.15s',
      }}>
        <Search size={15} color="var(--s400)" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar paciente por nombre o apellido…"
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, color: 'var(--s800)', background: 'transparent' }}
        />
        {isFetching && <Spinner size={14} color="var(--teal)" />}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', borderRadius: 10, border: '1px solid var(--s200)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden',
        }}>
          {results.length === 0 && !isFetching && (
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--s500)' }}>
              Sin resultados
            </div>
          )}
          {results.map(p => (
            <div
              key={p.id}
              onMouseDown={() => { onSelect(p); setOpen(false); setQuery(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={avatarStyle}>{initials(p)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--s800)' }}>
                  {patientFullName(p)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--s500)' }}>
                  {p.document_type_code} {p.document_number}
                </div>
              </div>
              {p.is_active
                ? <span style={{ ...badgeStyle, background: '#dcfce7', color: '#15803d' }}>Activo</span>
                : <span style={{ ...badgeStyle, background: '#fee2e2', color: '#b91c1c' }}>Inactivo</span>
              }
            </div>
          ))}
          <div
            onMouseDown={onNewPatient}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', cursor: 'pointer',
              borderTop: '1px solid var(--s100)',
              fontSize: 13, color: 'var(--teal)', fontWeight: 600,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-l)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <UserPlus size={14} />
            Registrar nuevo paciente
          </div>
        </div>
      )}
    </div>
  );
}
