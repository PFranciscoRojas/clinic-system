import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Plus, User, Phone, Mail, ChevronRight,
  AlertCircle, X, Info,
} from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

type SearchMode = 'list' | 'last_name' | 'document';

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  if (value !== debounced) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
  }
  return debounced;
}

export function PatientsPage() {
  const navigate = useNavigate();
  const [q, setQ]               = useState('');
  const [mode, setMode]         = useState<SearchMode>('list');
  const [page, setPage]         = useState(0);
  const dq                      = useDebounce(q, 400);
  const LIMIT                   = 30;

  const isSearching = dq.trim().length >= 2;

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['patients', mode, dq, page],
    queryFn: () => {
      if (!isSearching) {
        return patientsApi.list({ limit: LIMIT, offset: page * LIMIT });
      }
      return patientsApi.search({
        last_name: mode === 'last_name' ? dq.trim() : undefined,
        document:  mode === 'document'  ? dq.trim() : undefined,
        limit: LIMIT,
        offset: page * LIMIT,
      });
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const patients = data ?? [];

  const handleSearch = (v: string) => {
    setQ(v);
    setPage(0);
  };

  const clearSearch = () => {
    setQ('');
    setPage(0);
  };

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 2px' }}>Pacientes</h1>
          <p style={{ color: 'var(--s400)', fontSize: 13, margin: 0 }}>
            {isLoading ? 'Cargando…' : isSearching
              ? `${patients.length} resultado${patients.length !== 1 ? 's' : ''} encontrado${patients.length !== 1 ? 's' : ''}`
              : `${patients.length} paciente${patients.length !== 1 ? 's' : ''} registrado${patients.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => navigate('/patients/new')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
            background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(20,184,166,0.3)',
            transition: 'all .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-dark)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--teal)')}
        >
          <Plus size={16} /> Nuevo paciente
        </button>
      </div>

      {/* ── Search bar ───────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff', border: '1.5px solid var(--s200)', borderRadius: 12,
          padding: '10px 16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          transition: 'border-color .15s',
        }}
          onFocus={() => {}}
        >
          {isFetching && isSearching
            ? <Spinner size={16} color="var(--teal)" />
            : <Search size={16} color="var(--s400)" />
          }
          <input
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder={
              mode === 'document'
                ? 'Número de documento exacto…'
                : 'Buscar por apellido paterno exacto…'
            }
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 14, color: 'var(--s800)', outline: 'none',
            }}
          />
          {q && (
            <button
              onClick={clearSearch}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', alignItems: 'center', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Mode selector + hint */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { id: 'list' as SearchMode,      label: 'Todos' },
              { id: 'last_name' as SearchMode, label: 'Por apellido' },
              { id: 'document' as SearchMode,  label: 'Por documento' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setMode(id); clearSearch(); }}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  border: `1.5px solid ${mode === id ? 'var(--teal)' : 'var(--s200)'}`,
                  background: mode === id ? 'var(--teal-10)' : 'transparent',
                  color: mode === id ? 'var(--teal)' : 'var(--s500)',
                  cursor: 'pointer', transition: 'all .1s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {isSearching && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--s400)' }}>
              <Info size={11} />
              Búsqueda exacta por razones de privacidad
            </div>
          )}
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────── */}
      {isError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: '12px 16px', background: '#fef2f2', borderRadius: 12, marginBottom: 16 }}>
          <AlertCircle size={15} /> Error al cargar pacientes. Intenta de nuevo.
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={28} color="var(--teal)" />
        </div>
      ) : patients.length === 0 ? (
        <EmptyState isSearch={isSearching} q={q} onNew={() => navigate('/patients/new')} />
      ) : (
        <>
          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            {patients.map((patient, idx) => (
              <PatientRow
                key={patient.id}
                patient={patient}
                isLast={idx === patients.length - 1}
                onClick={() => navigate(`/patients/${patient.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {(patients.length === LIMIT || page > 0) && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: '1.5px solid var(--s200)',
                  background: page === 0 ? 'var(--s50)' : '#fff', color: page === 0 ? 'var(--s300)' : 'var(--s700)',
                  cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
                }}
              >
                ← Anterior
              </button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--s500)', padding: '0 8px' }}>
                Página {page + 1}
              </span>
              <button
                disabled={patients.length < LIMIT}
                onClick={() => setPage(p => p + 1)}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: '1.5px solid var(--s200)',
                  background: patients.length < LIMIT ? 'var(--s50)' : '#fff',
                  color: patients.length < LIMIT ? 'var(--s300)' : 'var(--s700)',
                  cursor: patients.length < LIMIT ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
                }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PatientRow({ patient, isLast, onClick }: { patient: Patient; isLast: boolean; onClick: () => void }) {
  const initials = [patient.paternal_last_name?.[0], patient.first_name?.[0]].filter(Boolean).join('').toUpperCase();
  const fullName = [patient.paternal_last_name, patient.maternal_last_name].filter(Boolean).join(' ')
    + ', ' + [patient.first_name, patient.middle_name].filter(Boolean).join(' ');

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--s100)',
        cursor: 'pointer', transition: 'background .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Avatar with initials */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: stringToColor(patient.paternal_last_name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: 0.5,
      }}>
        {initials || <User size={18} color="#fff" />}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--s800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullName}
          </span>
          {!patient.is_active && (
            <Badge label="Inactivo" color="var(--s500)" bg="var(--s100)" size="sm" />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {patient.email && (
            <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Mail size={11} color="var(--s300)" /> {patient.email}
            </span>
          )}
          {patient.phone && (
            <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Phone size={11} color="var(--s300)" /> {patient.phone}
            </span>
          )}
          {!patient.email && !patient.phone && (
            <span style={{ fontSize: 12, color: 'var(--s300)', fontStyle: 'italic' }}>Sin contacto registrado</span>
          )}
        </div>
      </div>

      <ChevronRight size={16} color="var(--s300)" style={{ flexShrink: 0 }} />
    </div>
  );
}

function EmptyState({ isSearch, q, onNew }: { isSearch: boolean; q: string; onNew: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        {isSearch ? <Search size={28} color="var(--s300)" /> : <User size={28} color="var(--s300)" />}
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--s700)', margin: '0 0 6px' }}>
        {isSearch ? `Sin resultados para "${q}"` : 'Aún no hay pacientes registrados'}
      </p>
      <p style={{ fontSize: 13, color: 'var(--s400)', margin: '0 0 20px', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
        {isSearch
          ? 'La búsqueda es exacta por el apellido paterno. Verifica la ortografía incluyendo tildes.'
          : 'Registra el primer paciente de tu organización.'}
      </p>
      {!isSearch && (
        <button
          onClick={onNew}
          style={{ padding: '9px 22px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
        >
          <Plus size={14} style={{ marginRight: 6 }} />Registrar primer paciente
        </button>
      )}
    </div>
  );
}

// Generates a consistent color from a string (for avatar backgrounds)
function stringToColor(s: string = '') {
  const palette = ['#0ea5e9','#8b5cf6','#ec4899','#f59e0b','#10b981','#6366f1','#ef4444','#14b8a6'];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}
