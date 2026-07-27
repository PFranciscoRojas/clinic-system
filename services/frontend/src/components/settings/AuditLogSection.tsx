import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText, ShieldAlert, ChevronLeft, ChevronRight, Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import {
  auditLogApi, actionLabel, AUDIT_FILTER_ACTIONS,
  type AuditEntry, type AuditLogFilters,
} from '@/api/auditLog';
import { SectionCard } from './primitives';

const PAGE_SIZE = 50;

/* An access log is only useful if a reader can tell an ordinary Tuesday apart
 * from something that needs explaining. Denials and break-the-glass reads are
 * the two rows that must never look like the rest. */
function toneOf(e: AuditEntry): { color: string; bg: string } {
  if (!e.success)                       return { color: '#b91c1c', bg: '#fef2f2' };
  if (e.reason)                         return { color: '#b45309', bg: '#fffbeb' };
  if (e.action === 'CLINICAL_RECORD_BULK_EXPORT') return { color: '#b45309', bg: '#fffbeb' };
  return { color: 'var(--s600)', bg: 'transparent' };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EntryRow({ e }: { e: AuditEntry }) {
  const tone = toneOf(e);
  const actor = e.actor_name || e.actor_email || 'Usuario eliminado';

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '11px 12px', borderBottom: '1px solid var(--s100)',
      background: tone.bg, alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: tone.color, fontWeight: e.success ? 500 : 600 }}>
          {actionLabel(e.action)}
          {!e.success && e.error_code && (
            <span style={{ fontWeight: 400, color: '#b91c1c' }}> · {e.error_code}</span>
          )}
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
          <span>{e.is_self ? 'Tú' : actor}</span>
          {e.patient_id && (
            <>
              <span style={{ color: 'var(--s300)' }}>·</span>
              <Link
                to={`/patients/${e.patient_id}`}
                style={{ color: 'var(--teal)', textDecoration: 'none' }}
              >
                {e.patient_name || 'Paciente'}
              </Link>
            </>
          )}
          {e.session_date && (
            <>
              <span style={{ color: 'var(--s300)' }}>·</span>
              <span>sesión del {e.session_date.slice(0, 10)}</span>
            </>
          )}
          {e.ip_address && (
            <>
              <span style={{ color: 'var(--s300)' }}>·</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5 }}>{e.ip_address}</span>
            </>
          )}
        </div>

        {e.reason && (
          <div style={{
            fontSize: 12, color: '#92400e', marginTop: 5, padding: '5px 9px',
            background: '#fef3c7', borderRadius: 7, display: 'flex', gap: 6, alignItems: 'flex-start',
          }}>
            <ShieldAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Acceso administrativo justificado: {e.reason}</span>
          </div>
        )}
      </div>

      <div style={{
        fontSize: 11.5, color: 'var(--s400)', whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums', paddingTop: 2,
      }}>
        {formatWhen(e.occurred_at)}
      </div>
    </div>
  );
}

export function AuditLogSection() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [page, setPage] = useState(0);

  const patch = (f: Partial<AuditLogFilters>) => {
    setFilters(prev => ({ ...prev, ...f }));
    setPage(0);
  };

  const query: AuditLogFilters = { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-log', query],
    queryFn: () => auditLogApi.list(query),
  });

  const items = data?.items ?? [];

  return (
    <SectionCard title="Registro de accesos" icon={ScrollText} color="#ef4444">
      <div style={{ padding: '14px 0 4px' }}>
        <p style={{ fontSize: 13, color: 'var(--s500)', lineHeight: 1.55, marginBottom: 14 }}>
          Cada vez que alguien abre, edita o descarga una historia clínica queda una entrada
          aquí, con quién fue y desde dónde. El registro no se puede editar ni borrar, tampoco
          por un administrador.
          {data && !data.org_wide && ' Ves lo tuyo y lo de tus pacientes asignados.'}
        </p>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <select
            value={filters.action ?? ''}
            onChange={e => patch({ action: e.target.value || undefined })}
            style={selectStyle}
          >
            <option value="">Toda la actividad</option>
            {AUDIT_FILTER_ACTIONS.map(a => (
              <option key={a} value={a}>{actionLabel(a)}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.from ?? ''}
            onChange={e => patch({ from: e.target.value || undefined })}
            style={selectStyle}
            aria-label="Desde"
          />
          <input
            type="date"
            value={filters.to ?? ''}
            onChange={e => patch({ to: e.target.value || undefined })}
            style={selectStyle}
            aria-label="Hasta"
          />

          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            color: 'var(--s600)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={filters.only_mine ?? false}
              onChange={e => patch({ only_mine: e.target.checked || undefined })}
            />
            Solo lo que hice yo
          </label>
        </div>

        {/* ── Listado ─────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : isError ? (
          <div style={{ fontSize: 13, color: '#b91c1c', padding: '16px 0' }}>
            No se pudo cargar el registro de accesos.
          </div>
        ) : items.length === 0 ? (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', padding: '18px 14px',
            background: 'var(--s50)', borderRadius: 10, fontSize: 13, color: 'var(--s500)',
          }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>No hay movimientos con esos filtros.</span>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--s200)', borderRadius: 11, overflow: 'hidden' }}>
            {items.map(e => <EntryRow key={e.id} e={e} />)}
          </div>
        )}

        {/* ── Paginación ──────────────────────────────────────────────────── */}
        {(page > 0 || data?.has_more) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={pagerStyle(page === 0)}
            >
              <ChevronLeft size={14} /> Más reciente
            </button>
            <span style={{ fontSize: 12, color: 'var(--s400)' }}>Página {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!data?.has_more}
              style={pagerStyle(!data?.has_more)}
            >
              Más antiguo <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '7px 11px', border: '1.5px solid var(--s200)', borderRadius: 9,
  fontSize: 13, color: 'var(--s700)', background: '#fff', cursor: 'pointer',
};

const pagerStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
  border: '1.5px solid var(--s200)', borderRadius: 9, background: '#fff',
  fontSize: 13, color: disabled ? 'var(--s300)' : 'var(--s600)',
  cursor: disabled ? 'default' : 'pointer',
});
