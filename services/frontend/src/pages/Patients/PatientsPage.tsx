import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, User, Phone, Mail, ChevronRight, AlertCircle } from 'lucide-react';
import { patientsApi } from '@/api/patients';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timerRef = { current: 0 as ReturnType<typeof setTimeout> };

  const update = useCallback((v: T) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedValue(v), delay);
  }, [delay]);

  if (value !== debouncedValue) update(value);
  return debouncedValue;
}

export function PatientsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 350);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patients', 'search', dq],
    queryFn: () => patientsApi.search({ q: dq, limit: 40 }),
    enabled: true,
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 4px' }}>Pacientes</h1>
          <p style={{ color: 'var(--s400)', fontSize: 14, margin: 0 }}>
            {data?.length ?? 0} {data?.length === 1 ? 'paciente' : 'pacientes'} encontrados
          </p>
        </div>
        <button
          onClick={() => navigate('/patients/new')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
            background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Nuevo paciente
        </button>
      </div>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#fff', border: '1.5px solid var(--s200)', borderRadius: 12,
        padding: '11px 16px', marginBottom: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <Search size={16} color="var(--s400)" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por apellido o número de documento…"
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--s800)', outline: 'none' }}
          autoFocus
        />
        {isLoading && <Spinner size={16} color="var(--teal)" />}
        {q && (
          <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex' }}>
            ×
          </button>
        )}
      </div>

      {/* Results */}
      {isError ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 20, background: '#fef2f2', borderRadius: 12 }}>
          <AlertCircle size={16} /> Error al cargar pacientes
        </div>
      ) : isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={28} color="var(--teal)" />
        </div>
      ) : data?.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--s400)' }}>
          <User size={48} color="var(--s200)" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
            {q ? `Sin resultados para "${q}"` : 'Aún no hay pacientes registrados'}
          </p>
          {!q && (
            <button
              onClick={() => navigate('/patients/new')}
              style={{ marginTop: 16, padding: '9px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Registrar primer paciente
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          {data?.map((patient, idx) => (
            <div
              key={patient.id}
              onClick={() => navigate(`/patients/${patient.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
                borderBottom: idx < (data?.length ?? 0) - 1 ? '1px solid var(--s100)' : 'none',
                cursor: 'pointer', transition: 'background .1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--teal-10), rgba(99,102,241,0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User size={20} color="var(--teal)" />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--s800)' }}>
                    {patient.paternal_last_name} {patient.maternal_last_name}, {patient.first_name}
                    {patient.middle_name ? ` ${patient.middle_name}` : ''}
                  </span>
                  <Badge
                    label={patient.is_active ? 'Activo' : 'Inactivo'}
                    color={patient.is_active ? '#065f46' : 'var(--s500)'}
                    bg={patient.is_active ? '#d1fae5' : 'var(--s100)'}
                    size="sm"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={11} /> {patient.email ?? '—'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Phone size={11} /> {patient.phone ?? '—'}
                  </span>
                </div>
              </div>

              <ChevronRight size={16} color="var(--s300)" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
