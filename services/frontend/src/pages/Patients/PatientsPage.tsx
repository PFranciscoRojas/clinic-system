import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Plus, User, Phone, Mail, ChevronRight,
  AlertCircle, X, Info, Users, UserCheck, UserX,
} from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

type SearchMode   = 'list' | 'last_name' | 'document';
type ActiveFilter = 'all' | 'active' | 'inactive';

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  if (value !== debounced) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
  }
  return debounced;
}

function stringToColor(s: string = '') {
  const palette = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#14b8a6'];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function calcAge(birthIso: string): number {
  const b = new Date(birthIso + 'T12:00:00');
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatsCardProps {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: number | '—';
}

function StatsCard({ icon, iconColor, label, value }: StatsCardProps) {
  return (
    <div style={{
      flex: 1,
      background: '#fff',
      border: '1px solid var(--s200)',
      borderRadius: 12,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      minWidth: 0,
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: iconColor + '18',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: iconColor,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--s800)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function PatientRow({ patient, isLast, onClick }: { patient: Patient; isLast: boolean; onClick: () => void }) {
  const initials = [patient.first_name?.[0], patient.paternal_last_name?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();

  const displayName = [patient.paternal_last_name, patient.first_name]
    .filter(Boolean)
    .join(', ');

  const age = patient.birth_date ? calcAge(patient.birth_date) : null;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--s100)',
        cursor: 'pointer',
        transition: 'background .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Avatar */}
      <div style={{
        width: 42,
        height: 42,
        borderRadius: '50%',
        flexShrink: 0,
        background: `linear-gradient(135deg, ${stringToColor(patient.paternal_last_name)}, ${stringToColor(patient.paternal_last_name)}bb)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: 0.5,
        boxShadow: `0 2px 8px ${stringToColor(patient.paternal_last_name)}44`,
      }}>
        {initials || <User size={17} color="#fff" />}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--s800)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {displayName}
          </span>
        </div>

        {/* Document + age row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {patient.document_type_code && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.3,
              color: 'var(--teal)',
              background: 'var(--teal-10, rgba(20,184,166,0.1))',
              border: '1px solid var(--teal-20, rgba(20,184,166,0.2))',
              borderRadius: 4,
              padding: '1px 5px',
              textTransform: 'uppercase',
            }}>
              {patient.document_type_code}
            </span>
          )}
          {patient.document_number && (
            <span style={{ fontSize: 12, color: 'var(--s500)', fontVariantNumeric: 'tabular-nums' }}>
              {patient.document_number}
            </span>
          )}
          {age !== null && (
            <span style={{ fontSize: 12, color: 'var(--s400)' }}>
              · {age} años
            </span>
          )}
        </div>
      </div>

      {/* Right side: contact + status */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {patient.email && (
          <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Mail size={11} color="var(--s300)" />
            {patient.email}
          </span>
        )}
        {patient.phone && (
          <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Phone size={11} color="var(--s300)" />
            {patient.phone}
          </span>
        )}
        {patient.is_active ? (
          <Badge label="Activo" color="#10b981" bg="#d1fae5" size="sm" />
        ) : (
          <Badge label="Inactivo" color="var(--s500)" bg="var(--s100)" size="sm" />
        )}
      </div>

      <ChevronRight size={16} color="var(--s300)" style={{ flexShrink: 0 }} />
    </div>
  );
}

function EmptyState({ isSearch, isFiltered, filter, q, onNew }: {
  isSearch: boolean;
  isFiltered: boolean;
  filter: ActiveFilter;
  q: string;
  onNew: () => void;
}) {
  const filterLabel = filter === 'active' ? 'activos' : 'inactivos';

  if (isFiltered && !isSearch) {
    return (
      <div style={{ textAlign: 'center', padding: '56px 24px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'var(--s100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          {filter === 'active'
            ? <UserCheck size={28} color="var(--s300)" />
            : <UserX size={28} color="var(--s300)" />
          }
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--s700)', margin: '0 0 6px' }}>
          Sin pacientes {filterLabel}
        </p>
        <p style={{ fontSize: 13, color: 'var(--s400)', margin: 0, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto' }}>
          No hay pacientes {filterLabel} en este momento.
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'var(--s100)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
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
          style={{
            padding: '9px 22px',
            background: 'var(--teal)',
            color: '#fff',
            border: 'none',
            borderRadius: 9,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={14} /> Registrar primer paciente
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PatientsPage() {
  const navigate = useNavigate();
  const [q, setQ]                     = useState('');
  const [mode, setMode]               = useState<SearchMode>('list');
  const [page, setPage]               = useState(0);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const dq                            = useDebounce(q, 400);
  const LIMIT                         = 30;

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

  // Client-side active/inactive filter
  const filteredPatients = activeFilter === 'all'
    ? patients
    : patients.filter(p => activeFilter === 'active' ? p.is_active : !p.is_active);

  const totalCount    = patients.length;
  const activeCount   = patients.filter(p => p.is_active).length;
  const inactiveCount = patients.filter(p => !p.is_active).length;

  const handleSearch = (v: string) => {
    setQ(v);
    setPage(0);
  };

  const clearSearch = () => {
    setQ('');
    setPage(0);
  };

  const isFiltered = activeFilter !== 'all';

  return (
    <div className="anim-fade-in">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 2px' }}>Pacientes</h1>
          <p style={{ color: 'var(--s400)', fontSize: 13, margin: 0 }}>
            {isLoading
              ? 'Cargando…'
              : isSearching
                ? `${filteredPatients.length} resultado${filteredPatients.length !== 1 ? 's' : ''} encontrado${filteredPatients.length !== 1 ? 's' : ''}`
                : `${totalCount} paciente${totalCount !== 1 ? 's' : ''} registrado${totalCount !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        <button
          onClick={() => navigate('/patients/new')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px',
            background: 'var(--teal)', color: '#fff',
            border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(20,184,166,0.3)',
            transition: 'all .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--teal-d, #0d9488)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--teal)')}
        >
          <Plus size={16} /> Nuevo paciente
        </button>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatsCard
          icon={<Users size={20} />}
          iconColor="var(--teal)"
          label="Total registrados"
          value={isLoading ? '—' : totalCount}
        />
        <StatsCard
          icon={<UserCheck size={20} />}
          iconColor="#10b981"
          label="Activos"
          value={isLoading ? '—' : activeCount}
        />
        <StatsCard
          icon={<UserX size={20} />}
          iconColor="#f59e0b"
          label="Inactivos"
          value={isLoading ? '—' : inactiveCount}
        />
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff',
          border: '1.5px solid var(--s200)',
          borderRadius: 12,
          padding: '10px 16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          transition: 'border-color .15s',
        }}>
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
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--s400)', display: 'flex', alignItems: 'center', padding: 2,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search mode selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { id: 'list'      as SearchMode, label: 'Todos' },
              { id: 'last_name' as SearchMode, label: 'Por apellido' },
              { id: 'document'  as SearchMode, label: 'Por documento' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setMode(id); clearSearch(); }}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  border: `1.5px solid ${mode === id ? 'var(--teal)' : 'var(--s200)'}`,
                  background: mode === id ? 'var(--teal-10, rgba(20,184,166,0.1))' : 'transparent',
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

      {/* ── Active/Inactive filter tabs ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([
          { id: 'all'      as ActiveFilter, label: 'Todos',     count: totalCount },
          { id: 'active'   as ActiveFilter, label: 'Activos',   count: activeCount },
          { id: 'inactive' as ActiveFilter, label: 'Inactivos', count: inactiveCount },
        ]).map(({ id, label, count }) => {
          const isSelected = activeFilter === id;
          return (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                border: `1.5px solid ${isSelected ? 'var(--teal)' : 'var(--s200)'}`,
                background: isSelected ? 'var(--teal)' : '#fff',
                color: isSelected ? '#fff' : 'var(--s600)',
                cursor: 'pointer', transition: 'all .15s',
                boxShadow: isSelected ? '0 2px 6px rgba(20,184,166,0.25)' : 'none',
              }}
            >
              {label}
              {!isLoading && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--s100)',
                  color: isSelected ? '#fff' : 'var(--s500)',
                  borderRadius: 10, padding: '1px 6px',
                  lineHeight: 1.6,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: 'var(--red)', padding: '12px 16px',
          background: '#fef2f2', borderRadius: 12, marginBottom: 16,
        }}>
          <AlertCircle size={15} /> Error al cargar pacientes. Intenta de nuevo.
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={28} color="var(--teal)" />
        </div>
      ) : filteredPatients.length === 0 ? (
        <EmptyState
          isSearch={isSearching}
          isFiltered={isFiltered}
          filter={activeFilter}
          q={q}
          onNew={() => navigate('/patients/new')}
        />
      ) : (
        <>
          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            {filteredPatients.map((patient, idx) => (
              <PatientRow
                key={patient.id}
                patient={patient}
                isLast={idx === filteredPatients.length - 1}
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
                  padding: '7px 16px', borderRadius: 8,
                  border: '1.5px solid var(--s200)',
                  background: page === 0 ? 'var(--s50)' : '#fff',
                  color: page === 0 ? 'var(--s300)' : 'var(--s700)',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 500,
                }}
              >
                ← Anterior
              </button>
              <span style={{
                display: 'flex', alignItems: 'center',
                fontSize: 13, color: 'var(--s500)', padding: '0 8px',
              }}>
                Página {page + 1}
              </span>
              <button
                disabled={patients.length < LIMIT}
                onClick={() => setPage(p => p + 1)}
                style={{
                  padding: '7px 16px', borderRadius: 8,
                  border: '1.5px solid var(--s200)',
                  background: patients.length < LIMIT ? 'var(--s50)' : '#fff',
                  color: patients.length < LIMIT ? 'var(--s300)' : 'var(--s700)',
                  cursor: patients.length < LIMIT ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 500,
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
