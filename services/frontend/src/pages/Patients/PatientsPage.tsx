import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Plus, Users, UserCheck, UserX,
  ChevronRight, AlertCircle, X, Info,
  Mail, Phone, CreditCard, Filter,
} from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { Spinner } from '@/components/ui/Spinner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function calcAge(birthIso: string): number {
  const b = new Date(birthIso + 'T12:00:00');
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#14b8a6', '#0ea5e9', '#ef4444',
];
function avatarColor(name: string = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, color, label, value }: {
  icon: React.ElementType; color: string; label: string; value: number | string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: '#fff', border: '1px solid var(--s200)', borderRadius: 12,
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--s800)', lineHeight: 1.1, letterSpacing: '-1px' }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Patient row ───────────────────────────────────────────────────────────────

function PatientRow({ patient, isLast, onClick }: { patient: Patient; isLast: boolean; onClick: () => void }) {
  const initials = [patient.first_name?.[0], patient.paternal_last_name?.[0]].filter(Boolean).join('').toUpperCase();
  const fullName = [patient.first_name, patient.middle_name, patient.paternal_last_name, patient.maternal_last_name]
    .filter(Boolean).join(' ');
  const color = avatarColor(patient.paternal_last_name);
  const age = patient.birth_date ? calcAge(patient.birth_date) : null;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 200px 120px 90px 28px',
        alignItems: 'center',
        gap: 16,
        padding: '13px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--s100)',
        cursor: 'pointer',
        transition: 'background .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(135deg, ${color}, ${color}bb)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: '#fff',
        boxShadow: `0 2px 6px ${color}44`,
      }}>
        {initials}
      </div>

      {/* Name + doc */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--s800)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: 3,
        }}>
          {fullName || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {patient.document_type_code && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
              color: 'var(--teal)', background: 'rgba(20,184,166,0.10)',
              border: '1px solid rgba(20,184,166,0.20)',
              borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase',
            }}>
              {patient.document_type_code}
            </span>
          )}
          {patient.document_number && (
            <span style={{ fontSize: 12, color: 'var(--s500)', fontVariantNumeric: 'tabular-nums' }}>
              {patient.document_number}
            </span>
          )}
        </div>
      </div>

      {/* Contact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        {patient.email && (
          <span style={{
            fontSize: 12, color: 'var(--s500)',
            display: 'flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <Mail size={11} color="var(--s300)" style={{ flexShrink: 0 }} />
            {patient.email}
          </span>
        )}
        {patient.phone && (
          <span style={{
            fontSize: 12, color: 'var(--s500)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Phone size={11} color="var(--s300)" style={{ flexShrink: 0 }} />
            {patient.phone}
          </span>
        )}
      </div>

      {/* Age */}
      <div style={{ fontSize: 13, color: 'var(--s600)', textAlign: 'center' }}>
        {age !== null ? `${age} años` : '—'}
      </div>

      {/* Status badge */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {patient.is_active ? (
          <span style={{
            fontSize: 11, fontWeight: 600, color: '#10b981',
            background: '#ecfdf5', border: '1px solid #6ee7b7',
            borderRadius: 6, padding: '3px 9px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            Activo
          </span>
        ) : (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--s400)',
            background: 'var(--s100)', border: '1px solid var(--s200)',
            borderRadius: 6, padding: '3px 9px',
          }}>
            Inactivo
          </span>
        )}
      </div>

      <ChevronRight size={15} color="var(--s300)" />
    </div>
  );
}

// ── Table header ──────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '40px 1fr 200px 120px 90px 28px',
      gap: 16,
      padding: '10px 20px',
      background: 'var(--s50)',
      borderBottom: '1px solid var(--s200)',
    }}>
      {['', 'Paciente', 'Contacto', 'Edad', 'Estado', ''].map((h, i) => (
        <div key={i} style={{
          fontSize: 11, fontWeight: 700, color: 'var(--s400)',
          textTransform: 'uppercase', letterSpacing: '.06em',
          textAlign: i === 3 ? 'center' : i === 4 ? 'center' : 'left',
        }}>
          {h}
        </div>
      ))}
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyState({ query, filter, onNew }: {
  query: string; filter: 'all' | 'active' | 'inactive'; onNew: () => void;
}) {
  if (query) return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Search size={24} color="var(--s300)" />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>
        Sin resultados para "{query}"
      </div>
      <div style={{ fontSize: 13, color: 'var(--s400)', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>
        La búsqueda es exacta. Verifica la ortografía incluyendo tildes.
      </div>
    </div>
  );

  if (filter !== 'all') return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        {filter === 'active' ? <UserCheck size={24} color="var(--s300)" /> : <UserX size={24} color="var(--s300)" />}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--s700)' }}>
        Sin pacientes {filter === 'active' ? 'activos' : 'inactivos'}
      </div>
    </div>
  );

  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
        <Users size={28} color="var(--teal)" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--s700)', marginBottom: 8 }}>
        Aún no hay pacientes registrados
      </div>
      <div style={{ fontSize: 13, color: 'var(--s400)', maxWidth: 300, margin: '0 auto 24px', lineHeight: 1.6 }}>
        Registra el primer paciente de tu organización.
      </div>
      <button
        onClick={onNew}
        style={{
          padding: '10px 24px', background: 'var(--teal)', color: '#fff',
          border: 'none', borderRadius: 10, cursor: 'pointer',
          fontSize: 14, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 7,
          boxShadow: '0 2px 10px rgba(20,184,166,0.3)',
        }}
      >
        <Plus size={15} />Registrar primer paciente
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'active' | 'inactive';
type SearchMode = 'last_name' | 'document';

const LIMIT = 30;

export function PatientsPage() {
  const navigate = useNavigate();
  const [q, setQ]             = useState('');
  const [mode, setMode]       = useState<SearchMode>('last_name');
  const [filter, setFilter]   = useState<Filter>('all');
  const [page, setPage]       = useState(0);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const dq = useDebounce(q, 380);
  const isSearching = dq.trim().length >= 2;

  // Close mode menu on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setShowModeMenu(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['patients', mode, dq, page],
    queryFn: () =>
      isSearching
        ? patientsApi.search({
            last_name: mode === 'last_name' ? dq.trim() : undefined,
            document:  mode === 'document'  ? dq.trim() : undefined,
            limit: LIMIT, offset: page * LIMIT,
          })
        : patientsApi.list({ limit: LIMIT, offset: page * LIMIT }),
    staleTime: 30_000,
    placeholderData: prev => prev,
  });

  const all      = data ?? [];
  const shown    = filter === 'all' ? all : all.filter(p => filter === 'active' ? p.is_active : !p.is_active);
  const total    = all.length;
  const actives  = all.filter(p => p.is_active).length;
  const inactive = all.filter(p => !p.is_active).length;

  const handleQ = (v: string) => { setQ(v); setPage(0); };

  const modeLabel = mode === 'last_name' ? 'Apellido paterno' : 'Nº documento';

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* ── Page header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0, letterSpacing: '-0.4px' }}>
            Pacientes
          </h1>
          <p style={{ fontSize: 13, color: 'var(--s400)', margin: '4px 0 0' }}>
            {isLoading
              ? 'Cargando…'
              : isSearching
                ? `${shown.length} resultado${shown.length !== 1 ? 's' : ''} para "${dq}"`
                : `${total} paciente${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => navigate('/patients/new')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10, border: 'none',
            background: 'var(--teal)', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(20,184,166,0.30)',
            transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
        >
          <Plus size={16} />Nuevo paciente
        </button>
      </div>

      {/* ── Stats ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard icon={Users}     color="var(--teal)" label="Total registrados" value={isLoading ? '—' : total}    />
        <StatCard icon={UserCheck} color="#10b981"     label="Activos"           value={isLoading ? '—' : actives}  />
        <StatCard icon={UserX}     color="#f59e0b"     label="Inactivos"         value={isLoading ? '—' : inactive} />
      </div>

      {/* ── Search + filters ────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid var(--s200)', borderRadius: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,.04)', marginBottom: 16, overflow: 'hidden',
      }}>
        {/* Search row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--s100)' }}>
          {isFetching && isSearching
            ? <Spinner size={16} color="var(--teal)" />
            : <Search size={16} color="var(--s400)" />
          }
          <input
            value={q}
            onChange={e => handleQ(e.target.value)}
            placeholder={`Buscar por ${modeLabel.toLowerCase()}…`}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 14, color: 'var(--s800)', outline: 'none',
            }}
          />
          {q && (
            <button onClick={() => handleQ('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s300)', display: 'flex', padding: 2 }}>
              <X size={14} />
            </button>
          )}

          {/* Mode selector */}
          <div ref={modeRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowModeMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 7,
                border: `1.5px solid ${showModeMenu ? 'var(--teal)' : 'var(--s200)'}`,
                background: showModeMenu ? 'var(--teal-l)' : 'var(--s50)',
                color: showModeMenu ? 'var(--teal)' : 'var(--s500)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all .12s',
              }}
            >
              <Filter size={12} />{modeLabel}
            </button>
            {showModeMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: '#fff', border: '1px solid var(--s200)', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,.10)', overflow: 'hidden', zIndex: 50,
                minWidth: 160,
              }}>
                {([
                  { id: 'last_name' as SearchMode, label: 'Apellido paterno', icon: '👤' },
                  { id: 'document'  as SearchMode, label: 'Nº de documento',  icon: <CreditCard size={13} /> },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => { setMode(opt.id); setShowModeMenu(false); setQ(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                      padding: '10px 14px', border: 'none', background: 'transparent',
                      textAlign: 'left', fontSize: 13, cursor: 'pointer',
                      color: mode === opt.id ? 'var(--teal)' : 'var(--s700)',
                      fontWeight: mode === opt.id ? 600 : 400,
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 14 }}>{typeof opt.icon === 'string' ? opt.icon : opt.icon}</span>
                    {opt.label}
                    {mode === opt.id && <span style={{ marginLeft: 'auto', color: 'var(--teal)', fontSize: 12 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter tabs + privacy note */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { id: 'all'      as Filter, label: 'Todos',     count: total    },
              { id: 'active'   as Filter, label: 'Activos',   count: actives  },
              { id: 'inactive' as Filter, label: 'Inactivos', count: inactive },
            ] as const).map(({ id, label, count }) => {
              const on = filter === id;
              return (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: on ? 600 : 400,
                    border: `1.5px solid ${on ? 'var(--teal)' : 'transparent'}`,
                    background: on ? 'var(--teal)' : 'transparent',
                    color: on ? '#fff' : 'var(--s500)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}
                >
                  {label}
                  {!isLoading && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      background: on ? 'rgba(255,255,255,.25)' : 'var(--s100)',
                      color: on ? '#fff' : 'var(--s400)',
                      borderRadius: 10, padding: '1px 6px',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {isSearching && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--s400)' }}>
              <Info size={11} />Búsqueda exacta por privacidad
            </div>
          )}
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: '#ef4444', padding: '12px 16px', marginBottom: 16,
          background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca',
          fontSize: 13,
        }}>
          <AlertCircle size={15} />Error al cargar pacientes. Intenta de nuevo.
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={28} color="var(--teal)" />
        </div>
      ) : shown.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, overflow: 'hidden' }}>
          <EmptyState query={isSearching ? dq : ''} filter={filter} onNew={() => navigate('/patients/new')} />
        </div>
      ) : (
        <>
          <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, overflow: 'hidden' }}>
            <TableHeader />
            {shown.map((patient, idx) => (
              <PatientRow
                key={patient.id}
                patient={patient}
                isLast={idx === shown.length - 1}
                onClick={() => navigate(`/patients/${patient.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {(all.length === LIMIT || page > 0) && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                style={{
                  padding: '7px 16px', borderRadius: 8,
                  border: '1.5px solid var(--s200)',
                  background: page === 0 ? 'var(--s50)' : '#fff',
                  color: page === 0 ? 'var(--s300)' : 'var(--s700)',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 500, transition: 'all .12s',
                }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: 13, color: 'var(--s400)', padding: '0 8px' }}>
                Página {page + 1}
              </span>
              <button
                disabled={all.length < LIMIT}
                onClick={() => setPage(p => p + 1)}
                style={{
                  padding: '7px 16px', borderRadius: 8,
                  border: '1.5px solid var(--s200)',
                  background: all.length < LIMIT ? 'var(--s50)' : '#fff',
                  color: all.length < LIMIT ? 'var(--s300)' : 'var(--s700)',
                  cursor: all.length < LIMIT ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 500, transition: 'all .12s',
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
