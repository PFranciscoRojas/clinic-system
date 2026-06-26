import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Plus, Users,
  AlertCircle, X, CreditCard,
  LayoutGrid, List, Eye, CalendarPlus,
  Mail, Phone, Heart, UserPlus, ClipboardList,
  MapPin, Download,
} from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { calcAge } from '@/lib/age';
import { useIsMobile, useIsCompact } from '@/lib/useMediaQuery';
import { Spinner } from '@/components/ui/Spinner';

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#14b8a6', '#0ea5e9', '#ef4444',
];
function avatarColor(name = ''): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function fullName(p: Patient): string {
  return [p.first_name, p.middle_name, p.paternal_last_name, p.maternal_last_name]
    .filter(Boolean).join(' ');
}

function abbr(p: Patient): string {
  return [p.first_name?.[0], p.paternal_last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ active, size = 'sm' }: { active: boolean; size?: 'sm' | 'md' }) {
  const pad  = size === 'md' ? '4px 10px' : '2px 8px';
  const font = size === 'md' ? 12 : 11;
  const dot  = size === 'md' ? 7 : 5;

  return active ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font, fontWeight: 700, color: '#10b981', background: '#ecfdf5', borderRadius: 7, padding: pad }}>
      <span style={{ width: dot, height: dot, borderRadius: '50%', background: '#10b981', display: 'block' }} />Activo
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font, fontWeight: 700, color: 'var(--s400)', background: 'var(--s100)', borderRadius: 7, padding: pad }}>
      <span style={{ width: dot, height: dot, borderRadius: '50%', background: 'var(--s400)', display: 'block' }} />Inactivo
    </span>
  );
}

// ── PatientCard (grid) ────────────────────────────────────────────────────────

function PatientCard({ patient, onClick, onOpenProfile }: { patient: Patient; onClick: () => void; onOpenProfile: () => void }) {
  const color = avatarColor(patient.paternal_last_name);
  const age   = calcAge(patient.birth_date);
  const name  = fullName(patient);
  const ini   = abbr(patient);

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 14, border: '1.5px solid var(--s200)',
        overflow: 'hidden', cursor: 'pointer', position: 'relative',
        transition: 'all .15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = color;
        el.style.boxShadow   = `0 4px 20px ${color}22`;
        el.style.transform   = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--s200)';
        el.style.boxShadow   = 'none';
        el.style.transform   = '';
      }}
    >
      {/* Top accent */}
      <div style={{ height: 3, background: color, opacity: patient.is_active ? 1 : 0.35 }} />

      <div style={{ padding: '16px 18px 14px' }}>
        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color,
          }}>
            {ini}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>
              {age !== null ? `${age} años` : 'Edad N/D'}
              {patient.document_number ? ` · ${patient.document_number}` : ''}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <StatusBadge active={patient.is_active} />
          {patient.document_type_code && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'rgba(20,184,166,.10)', border: '1px solid rgba(20,184,166,.20)', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase' as const }}>
              {patient.document_type_code}
            </span>
          )}
        </div>

        {/* Contact */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14, minHeight: 40 }}>
          {patient.email ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--s500)' }}>
              <Mail size={11} color="var(--s300)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{patient.email}</span>
            </div>
          ) : null}
          {patient.phone ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--s500)' }}>
              <Phone size={11} color="var(--s300)" />
              {patient.phone}
            </div>
          ) : null}
          {!patient.email && !patient.phone && (
            <div style={{ fontSize: 12, color: 'var(--s300)', fontStyle: 'italic' }}>Sin datos de contacto</div>
          )}
        </div>

        {/* Action */}
        <button
          onClick={e => { e.stopPropagation(); onOpenProfile(); }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, border: '1.5px solid var(--s200)', borderRadius: 9, background: '#fff', fontSize: 13, color: 'var(--s600)', fontWeight: 500, transition: 'all .12s', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.color = 'var(--s600)'; }}
        >
          <Eye size={13} />Ver perfil
        </button>
      </div>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

const TABLE_COLS = '1fr 110px 64px 150px 190px 80px';

function TableHeader() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: TABLE_COLS, padding: '9px 20px', background: 'var(--s50)', borderBottom: '1px solid var(--s200)', gap: 12 }}>
      {['Paciente', 'Estado', 'Edad', 'Documento', 'Correo', 'Acciones'].map(h => (
        <div key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
          {h}
        </div>
      ))}
    </div>
  );
}

function PatientTableRow({ patient, isLast, onQuickView, onOpenProfile }: { patient: Patient; isLast: boolean; onQuickView: () => void; onOpenProfile: () => void }) {
  const color = avatarColor(patient.paternal_last_name);
  const age   = calcAge(patient.birth_date);
  const name  = fullName(patient);
  const ini   = abbr(patient);

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: TABLE_COLS, padding: '12px 20px', borderBottom: isLast ? 'none' : '1px solid var(--s100)', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background .1s' }}
      onClick={onOpenProfile}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color }}>
          {ini}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
          {patient.phone && (
            <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 1 }}>{patient.phone}</div>
          )}
        </div>
      </div>

      {/* Status */}
      <StatusBadge active={patient.is_active} />

      {/* Age */}
      <div style={{ fontSize: 13, color: 'var(--s600)' }}>{age !== null ? `${age}a` : '—'}</div>

      {/* Document */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        {patient.document_type_code && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'rgba(20,184,166,.10)', border: '1px solid rgba(20,184,166,.20)', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase' as const, flexShrink: 0 }}>
            {patient.document_type_code}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--s500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {patient.document_number || '—'}
        </span>
      </div>

      {/* Email */}
      <div style={{ fontSize: 12, color: 'var(--s500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {patient.email || '—'}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          onClick={e => { e.stopPropagation(); onQuickView(); }}
          title="Vista rápida"
          style={{ border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 7, padding: '5px 8px', display: 'flex', transition: 'all .12s', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; }}
        >
          <Eye size={13} color="var(--s400)" />
        </button>
      </div>
    </div>
  );
}

// ── QuickViewPanel ────────────────────────────────────────────────────────────

function QuickViewPanel({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const navigate = useNavigate();
  const color    = avatarColor(patient.paternal_last_name);
  const age      = calcAge(patient.birth_date);
  const name     = fullName(patient);
  const ini      = abbr(patient);

  type InfoRow = { icon: React.ElementType; label: string; value: string };
  const rows: InfoRow[] = [
    patient.email       && { icon: Mail,       label: 'Correo',      value: patient.email },
    patient.phone       && { icon: Phone,      label: 'Teléfono',    value: patient.phone },
    patient.birth_date  && { icon: Heart,      label: 'Fecha nac.',  value: new Date(patient.birth_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) },
    patient.document_number && { icon: CreditCard, label: patient.document_type_code ?? 'Documento', value: patient.document_number },
    patient.gender      && { icon: Users,      label: 'Género',      value: patient.gender },
    patient.address     && { icon: MapPin,     label: 'Dirección',   value: patient.address },
  ].filter(Boolean) as InfoRow[];

  return (
    <div
      className="anim-fade-in"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="anim-scale-in"
        style={{ width: 380, maxWidth: '92vw', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--s200)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color, flexShrink: 0 }}>
            {ini}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--s800)', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 2 }}>
              {age !== null ? `${age} años` : ''}
              {patient.document_number ? ` · ${patient.document_number}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', color: 'var(--s400)', display: 'flex', padding: 6, borderRadius: 8, transition: 'background .12s', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s100)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
          {/* Status badge */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            <StatusBadge active={patient.is_active} size="md" />
          </div>

          {/* Info rows */}
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--s50)' }}>
              <Icon size={14} color="var(--s400)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--s400)', textTransform: 'uppercase' as const, letterSpacing: '.05em' }}>{label}</div>
                <div style={{ fontSize: 13.5, color: 'var(--s700)', marginTop: 2, fontWeight: 500 }}>{value}</div>
              </div>
            </div>
          ))}

          {/* Sessions placeholder */}
          <div style={{ margin: '18px 0 0', padding: '14px 16px', background: 'var(--s50)', borderRadius: 12, border: '1px solid var(--s200)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: '-1px' }}>—</div>
              <div style={{ fontSize: 11, color: 'var(--s400)' }}>sesiones</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--s200)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>Evolución clínica</div>
              <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>Ver historial en el perfil completo</div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--s200)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => navigate(`/patients/${patient.id}`)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 11, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: '#fff', fontSize: 14, fontWeight: 800, boxShadow: `0 4px 14px ${color}44`, transition: 'filter .15s' }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
            onMouseLeave={e => (e.currentTarget.style.filter = '')}
          >
            <Eye size={16} />Abrir perfil completo
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              onClick={() => navigate('/appointments/new')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, borderRadius: 10, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 500, transition: 'all .12s', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.color = 'var(--s600)'; }}
            >
              <CalendarPlus size={14} />Nueva cita
            </button>
            <button
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10, borderRadius: 10, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 500, transition: 'all .12s', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.color = '#8b5cf6'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.color = 'var(--s600)'; }}
            >
              <ClipboardList size={14} />Evaluación
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ query, filter, onNew }: { query: string; filter: StatusFilter; onNew: () => void }) {
  if (query) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--s400)', gap: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Search size={22} color="var(--s300)" />
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--s500)' }}>Sin resultados para "{query}"</div>
      <div style={{ fontSize: 13 }}>Verifica la ortografía o ajusta los filtros</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Users size={28} color="var(--teal)" />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--s700)' }}>
        {filter !== 'all' ? 'Sin pacientes con este filtro' : 'Aún no hay pacientes registrados'}
      </div>
      {filter === 'all' && (
        <button
          onClick={onNew}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, boxShadow: '0 2px 10px rgba(20,184,166,.3)' }}
        >
          <Plus size={15} />Registrar primer paciente
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ViewMode    = 'grid' | 'table';
type StatusFilter = 'all' | 'active' | 'inactive';

const LIMIT = 50;

export function PatientsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const compact  = useIsCompact();

  const [csvBusy, setCsvBusy] = useState(false);

  const downloadCSV = async () => {
    setCsvBusy(true);
    try {
      const blob = await patientsApi.exportCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('No se pudo generar el CSV. Intenta de nuevo.');
    } finally {
      setCsvBusy(false);
    }
  };

  const [viewMode,      setViewMode]      = useState<ViewMode>(
    () => (localStorage.getItem('sghcp_patients_view') as ViewMode) || 'grid'
  );
  const changeView = (v: ViewMode) => { setViewMode(v); localStorage.setItem('sghcp_patients_view', v); };
  const [selected,      setSelected]      = useState<Patient | null>(null);
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');
  const [page,          setPage]          = useState(0);

  // Search lives in the header (global, with a results dropdown). This page
  // just lists and filters by status.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['patients', 'list', page],
    queryFn:  () => patientsApi.list({ limit: LIMIT, offset: page * LIMIT }),
    staleTime: 30_000,
    placeholderData: prev => prev,
  });

  const all     = data ?? [];
  const shown   = useMemo(() => {
    if (statusFilter === 'active')   return all.filter(p => p.is_active);
    if (statusFilter === 'inactive') return all.filter(p => !p.is_active);
    return all;
  }, [all, statusFilter]);

  const total    = all.length;
  const actives  = all.filter(p => p.is_active).length;
  const inactive = all.filter(p => !p.is_active).length;

  // The fixed-column table doesn't fit a phone — always show cards there.
  const effectiveView: ViewMode = isMobile ? 'grid' : viewMode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...(compact ? { minHeight: 'calc(100dvh - var(--topbar-h))' } : { height: 'calc(100dvh - var(--topbar-h))', overflow: 'hidden' }) }}>

      {/* ── Filters toolbar ─────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--s200)', padding: '10px 24px', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Search lives in the header — use it to find a patient by last name
            or document. This toolbar keeps only the status filters and view. */}
        <div style={{ flex: 1 }} />

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 5 }}>
          {([
            { id: 'all'      as StatusFilter, label: 'Todos',     count: total    },
            { id: 'active'   as StatusFilter, label: 'Activos',   count: actives  },
            { id: 'inactive' as StatusFilter, label: 'Inactivos', count: inactive },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              style={{ padding: '6px 14px', borderRadius: 99, border: 'none', background: statusFilter === f.id ? 'var(--teal)' : 'var(--s100)', color: statusFilter === f.id ? '#fff' : 'var(--s500)', fontSize: 12.5, fontWeight: statusFilter === f.id ? 700 : 400, transition: 'all .12s', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              {f.label}{!isLoading ? ` (${f.count})` : ''}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {!isLoading && (
          <div style={{ fontSize: 12.5, color: 'var(--s400)' }}>
            {shown.length} paciente{shown.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--s100)', borderRadius: 9, padding: 3, gap: 2 }}>
          {([
            { id: 'grid'  as ViewMode, icon: LayoutGrid },
            { id: 'table' as ViewMode, icon: List       },
          ] as const).map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => changeView(id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 28, borderRadius: 7, border: 'none', background: viewMode === id ? '#fff' : 'transparent', boxShadow: viewMode === id ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all .15s', cursor: 'pointer' }}
            >
              <Icon size={14} color={viewMode === id ? 'var(--teal)' : 'var(--s400)'} />
            </button>
          ))}
        </div>

        {/* Export CSV */}
        <button
          onClick={downloadCSV}
          disabled={csvBusy}
          title="Exportar lista de pacientes a CSV"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s700)', fontSize: 13, fontWeight: 600, cursor: csvBusy ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }}
          onMouseEnter={e => { if (!csvBusy) e.currentTarget.style.borderColor = 'var(--teal)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; }}
        >
          <Download size={14} />{csvBusy ? 'Generando…' : 'Exportar CSV'}
        </button>

        {/* New patient */}
        <button
          onClick={() => navigate('/patients/new')}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(20,184,166,.35)', whiteSpace: 'nowrap', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
        >
          <UserPlus size={15} />Nuevo paciente
        </button>
      </div>

      {/* Error */}
      {isError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', padding: '10px 24px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 13, flexShrink: 0 }}>
          <AlertCircle size={15} />Error al cargar pacientes. Intenta de nuevo.
        </div>
      )}

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spinner size={28} color="var(--teal)" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            query=""
            filter={statusFilter}
            onNew={() => navigate('/patients/new')}
          />
        ) : effectiveView === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {shown.map(p => (
              <PatientCard key={p.id} patient={p} onClick={() => setSelected(p)} onOpenProfile={() => navigate(`/patients/${p.id}`)} />
            ))}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', overflow: 'hidden' }}>
            <TableHeader />
            {shown.map((p, idx) => (
              <PatientTableRow
                key={p.id}
                patient={p}
                isLast={idx === shown.length - 1}
                onQuickView={() => setSelected(p)}
                onOpenProfile={() => navigate(`/patients/${p.id}`)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {(all.length === LIMIT || page > 0) && !isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid var(--s200)', background: page === 0 ? 'var(--s50)' : '#fff', color: page === 0 ? 'var(--s300)' : 'var(--s700)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: 13, color: 'var(--s400)' }}>Página {page + 1}</span>
            <button
              disabled={all.length < LIMIT}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid var(--s200)', background: all.length < LIMIT ? 'var(--s50)' : '#fff', color: all.length < LIMIT ? 'var(--s300)' : 'var(--s700)', cursor: all.length < LIMIT ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              Siguiente →
            </button>
          </div>
        )}
      </main>

      {/* Quick-view panel */}
      {selected && <QuickViewPanel patient={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
