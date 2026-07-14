import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Brain, FileText, Clock, CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { aiDraftsApi, type DraftMeta, type DraftStatus } from '@/api/aiDrafts';
import { clinicalRecordsApi, type RecordMeta, type RecordStatus } from '@/api/clinicalRecords';
import { fmtDateOnly } from '@/lib/dates';
import { useIsMobile } from '@/lib/useMediaQuery';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtCode(code: number | null) {
  return code != null ? `HC-${String(code).padStart(6, '0')}` : '—';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Draft status badge ────────────────────────────────────────────────────────

const DRAFT_STATUS: Record<DraftStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PENDING:    { label: 'En cola',    color: '#6b7280', bg: '#f3f4f6', Icon: Clock },
  PROCESSING: { label: 'Procesando', color: '#2563eb', bg: '#eff6ff', Icon: Loader2 },
  DRAFT_READY:{ label: 'Listo',      color: '#d97706', bg: '#fef3c7', Icon: Brain },
  APPROVED:   { label: 'Aprobado',   color: '#059669', bg: '#d1fae5', Icon: CheckCircle2 },
  REJECTED:   { label: 'Rechazado',  color: '#6b7280', bg: '#f3f4f6', Icon: XCircle },
  ERROR:      { label: 'Error',      color: '#dc2626', bg: '#fee2e2', Icon: AlertTriangle },
  // Folded into a later consolidated take — hidden from the list, listed here only for type completeness.
  SUPERSEDED: { label: 'Consolidado', color: '#6b7280', bg: '#f3f4f6', Icon: Loader2 },
  // Recording transcribed to nothing — hidden from the list, here for type completeness.
  EMPTY:      { label: 'Sin contenido', color: '#92400e', bg: '#fef3c7', Icon: AlertTriangle },
};

function DraftBadge({ status }: { status: DraftStatus }) {
  const cfg = DRAFT_STATUS[status] ?? DRAFT_STATUS.PENDING;
  const { Icon } = cfg;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

// ── Record status badge ───────────────────────────────────────────────────────

const RECORD_STATUS: Record<RecordStatus, { label: string; color: string; bg: string }> = {
  DRAFT:    { label: 'Borrador', color: '#d97706', bg: '#fef3c7' },
  APPROVED: { label: 'Aprobado', color: '#059669', bg: '#d1fae5' },
};

const RECORD_TYPE_LABEL: Record<string, string> = {
  INITIAL:           'Apertura',
  EVOLUTION:         'Evolución',
  DISCHARGE:         'Alta',
  INTERCONSULTATION: 'Interconsulta',
};

const RISK_COLOR: Record<string, string> = {
  NONE:      '#6b7280',
  IDEATION:  '#d97706',
  PLAN:      '#ea580c',
  ATTEMPT:   '#dc2626',
};

// ── Row components ────────────────────────────────────────────────────────────

function DraftRow({ d, onClick }: { d: DraftMeta; onClick: () => void }) {
  const isMobile = useIsMobile();
  // Every state has a destination now: the draft page live-polls the
  // generating states and explains errors — this is how the professional
  // gets back to a session they navigated away from (Punto 3).
  const action: { label: string; solid: boolean } | null =
    d.status === 'DRAFT_READY' ? { label: 'Revisar', solid: true }
    : d.status === 'PENDING' || d.status === 'PROCESSING' ? { label: 'Ver estado', solid: false }
    : d.status === 'ERROR' ? { label: 'Ver error', solid: false }
    : null;
  const actionable = action !== null;
  const actionChip = action && (
    <span style={action.solid
      ? { fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--teal)', borderRadius: 6, padding: '3px 10px' }
      : { fontSize: 12, fontWeight: 600, color: 'var(--s600)', background: '#fff', border: '1px solid var(--s200)', borderRadius: 6, padding: '3px 10px' }}
    >{action.label}</span>
  );
  return (
    <div
      onClick={actionable ? onClick : undefined}
      style={{
        ...(isMobile
          // Two-line card: code + date on top, badge + action below.
          ? { display: 'flex', flexWrap: 'wrap', gap: 8 }
          : { display: 'grid', gridTemplateColumns: '110px 1fr auto auto', gap: 16 }),
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid var(--s100)',
        cursor: actionable ? 'pointer' : 'default',
        background: actionable ? 'var(--s50)' : '#fff',
        transition: 'background .15s',
      }}
      onMouseEnter={e => actionable && ((e.currentTarget as HTMLElement).style.background = 'var(--s100)')}
      onMouseLeave={e => actionable && ((e.currentTarget as HTMLElement).style.background = 'var(--s50)')}
    >
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--teal)', fontFamily: "'DM Mono', monospace" }}>
        {fmtCode(d.patient_code)}
      </span>
      {isMobile ? (
        <>
          <span style={{ fontSize: 12, color: 'var(--s400)', marginLeft: 'auto' }}>{fmtDate(d.created_at)}</span>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <DraftBadge status={d.status} />
            {actionChip}
          </div>
        </>
      ) : (
        <>
          <DraftBadge status={d.status} />
          <span style={{ fontSize: 12, color: 'var(--s400)' }}>{fmtDate(d.created_at)}</span>
          {actionChip}
        </>
      )}
    </div>
  );
}

function RecordRow({ m, onClick }: { m: RecordMeta; onClick: () => void }) {
  const isMobile = useIsMobile();
  const s = RECORD_STATUS[m.status];
  const riskChip = m.risk_level && m.risk_level !== 'NONE' && (
    <span style={{ fontSize: 11, fontWeight: 700, color: RISK_COLOR[m.risk_level] ?? '#6b7280' }}>
      ⚠ {m.risk_level}
    </span>
  );
  const statusChip = (
    <span style={{
      fontSize: 12, fontWeight: 600,
      color: s?.color ?? '#6b7280', background: s?.bg ?? '#f3f4f6',
      borderRadius: 12, padding: '2px 8px',
    }}>
      {s?.label ?? m.status}
    </span>
  );
  return (
    <div
      onClick={onClick}
      style={{
        ...(isMobile
          // Two-line card: code + date on top; type, risk and status below.
          ? { display: 'flex', flexWrap: 'wrap', gap: 8 }
          : { display: 'grid', gridTemplateColumns: '110px 120px 1fr auto auto', gap: 16 }),
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid var(--s100)',
        cursor: 'pointer',
        background: '#fff',
        transition: 'background .15s',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--s50)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#fff')}
    >
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--teal)', fontFamily: "'DM Mono', monospace" }}>
        {fmtCode(m.patient_code)}
      </span>
      {isMobile ? (
        <>
          <span style={{ fontSize: 12, color: 'var(--s400)', marginLeft: 'auto' }}>{fmtDateOnly(m.session_date)}</span>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--s600)' }}>
              {RECORD_TYPE_LABEL[m.record_type] ?? m.record_type}
            </span>
            {riskChip}
            <span style={{ marginLeft: 'auto' }}>{statusChip}</span>
          </div>
        </>
      ) : (
        <>
          <span style={{ fontSize: 13, color: 'var(--s600)' }}>
            {RECORD_TYPE_LABEL[m.record_type] ?? m.record_type}
          </span>
          <span style={{ fontSize: 12, color: 'var(--s400)' }}>{fmtDateOnly(m.session_date)}</span>
          {riskChip}
          {statusChip}
        </>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--s400)' }}>
      <p style={{ margin: 0, fontSize: 13 }}>{msg}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'drafts' | 'records';
type DraftFilter = 'DRAFT_READY' | 'ALL';
type RecordFilter = 'DRAFT' | 'ALL';

export function ClinicalPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('drafts');
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('DRAFT_READY');
  const [recordFilter, setRecordFilter] = useState<RecordFilter>('DRAFT');

  const { data: drafts = [], isLoading: draftsLoading } = useQuery({
    queryKey: ['ai-drafts-list', draftFilter],
    queryFn: () => aiDraftsApi.list(draftFilter === 'ALL' ? undefined : draftFilter as DraftStatus),
    enabled: !!user && tab === 'drafts',
    refetchInterval: 30_000,
  });

  const { data: allRecords = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['clinical-records-all', recordFilter],
    queryFn: () => clinicalRecordsApi.listAll(recordFilter === 'ALL' ? undefined : recordFilter),
    enabled: !!user && tab === 'records',
  });
  // Exclude unfinalized autosave drafts — they're scratch work in progress
  // (or abandoned), not real authored notes pending review. They share
  // status: 'DRAFT' with normal drafts, so this list would otherwise be
  // polluted with notes nobody actually saved.
  const records = allRecords.filter(r => r.finalized !== false);

  const pendingDrafts = drafts.filter(d => d.status === 'DRAFT_READY').length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', fontSize: 14, fontWeight: active ? 700 : 500,
    color: active ? 'var(--teal)' : 'var(--s500)',
    borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent',
    cursor: 'pointer', background: 'none', border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: active ? 'var(--teal)' : 'transparent',
    display: 'flex', alignItems: 'center', gap: 6,
  });

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'var(--teal)' : 'var(--s100)',
    color: active ? '#fff' : 'var(--s600)',
    border: 'none',
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--s800)' }}>Clínico</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--s400)' }}>
          Borradores IA y registros clínicos de todos tus pacientes
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--s200)', marginBottom: 0 }}>
        <button style={tabStyle(tab === 'drafts')} onClick={() => setTab('drafts')}>
          <Brain size={15} />
          Borradores IA
          {pendingDrafts > 0 && (
            <span style={{
              background: '#f59e0b', color: '#fff',
              borderRadius: 10, fontSize: 11, fontWeight: 700,
              padding: '0 6px', minWidth: 18, textAlign: 'center',
            }}>{pendingDrafts}</span>
          )}
        </button>
        <button style={tabStyle(tab === 'records')} onClick={() => setTab('records')}>
          <FileText size={15} />
          Registros clínicos
        </button>
      </div>

      {/* Panel */}
      <div style={{ background: '#fff', border: '1px solid var(--s200)', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>

        {/* Filters bar */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 16px',
          borderBottom: '1px solid var(--s100)', alignItems: 'center',
        }}>
          {tab === 'drafts' ? (
            <>
              <button style={chipStyle(draftFilter === 'DRAFT_READY')} onClick={() => setDraftFilter('DRAFT_READY')}>
                Pendientes de revisión
              </button>
              <button style={chipStyle(draftFilter === 'ALL')} onClick={() => setDraftFilter('ALL')}>
                Todos
              </button>
            </>
          ) : (
            <>
              <button style={chipStyle(recordFilter === 'DRAFT')} onClick={() => setRecordFilter('DRAFT')}>
                Borradores
              </button>
              <button style={chipStyle(recordFilter === 'ALL')} onClick={() => setRecordFilter('ALL')}>
                Todos
              </button>
            </>
          )}
        </div>

        {/* Column headers — hidden on mobile, where rows render as stacked cards */}
        {isMobile ? null : tab === 'drafts' ? (
          <div style={{
            display: 'grid', gridTemplateColumns: '110px 1fr auto auto',
            gap: 16, padding: '8px 16px',
            fontSize: 11, fontWeight: 600, color: 'var(--s400)',
            textTransform: 'uppercase', letterSpacing: '.05em',
            borderBottom: '1px solid var(--s100)',
          }}>
            <span>Paciente</span><span>Estado</span><span>Fecha</span><span></span>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: '110px 120px 1fr auto auto',
            gap: 16, padding: '8px 16px',
            fontSize: 11, fontWeight: 600, color: 'var(--s400)',
            textTransform: 'uppercase', letterSpacing: '.05em',
            borderBottom: '1px solid var(--s100)',
          }}>
            <span>Paciente</span><span>Tipo</span><span>Fecha sesión</span><span>Riesgo</span><span>Estado</span>
          </div>
        )}

        {/* Rows */}
        {tab === 'drafts' && (
          draftsLoading
            ? <Empty msg="Cargando…" />
            : drafts.length === 0
              ? <Empty msg={draftFilter === 'DRAFT_READY' ? 'No hay borradores pendientes de revisión.' : 'No hay borradores.'} />
              : drafts.map(d => (
                  <DraftRow key={d.id} d={d} onClick={() => navigate(`/ai-drafts/${d.id}${d.appointment_id ? `?appointment_id=${d.appointment_id}` : ''}`)} />
                ))
        )}

        {tab === 'records' && (
          recordsLoading
            ? <Empty msg="Cargando…" />
            : records.length === 0
              ? <Empty msg={recordFilter === 'DRAFT' ? 'No hay registros en borrador.' : 'No hay registros clínicos.'} />
              : records.map(m => (
                  <RecordRow key={m.id} m={m} onClick={() => navigate(`/clinical-records/${m.id}`)} />
                ))
        )}
      </div>
    </div>
  );
}
