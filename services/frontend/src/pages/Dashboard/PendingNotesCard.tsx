import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { FileWarning } from 'lucide-react';
import { appointmentsApi } from '@/api/appointments';
import { patientsApi } from '@/api/patients';

// COMPLETED sessions (last 30 days) still missing their clinical note — the
// ones the professional risks forgetting to close. Renders nothing when the
// list is empty, so it costs zero attention in the happy path.
export function PendingNotesCard() {
  const { data: items = [] } = useQuery({
    queryKey: ['pending-notes'],
    queryFn: appointmentsApi.pendingNotes,
    staleTime: 60_000,
  });

  const patients = useQueries({
    queries: items.map(n => ({
      queryKey: ['patient', n.patient_id],
      queryFn: () => patientsApi.get(n.patient_id),
      staleTime: 5 * 60_000,
    })),
  });

  if (items.length === 0) return null;

  const badge = (draft: string) =>
    draft === 'DRAFT_READY'
      ? { label: 'Borrador IA sin aprobar', bg: '#fef3c7', color: '#92400e' }
      : draft === 'PENDING' || draft === 'PROCESSING'
        ? { label: 'IA procesando', bg: '#e0f2fe', color: '#0369a1' }
        : { label: 'Sin nota', bg: '#fee2e2', color: '#991b1b' };

  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 20, border: '1px solid #fde68a', background: '#fffdf5' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FileWarning size={16} color="#d97706" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>
          Sesiones sin registro clínico
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, background: '#fde68a', color: '#78350f', borderRadius: 10, padding: '1px 8px' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((n, i) => {
          const p = patients[i]?.data;
          const name = p ? [p.first_name, p.paternal_last_name].filter(Boolean).join(' ') : '···';
          const b = badge(n.draft_status);
          return (
            <Link
              key={n.appointment_id}
              to={`/appointments/${n.appointment_id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, textDecoration: 'none', background: '#fff', border: '1px solid var(--s100)' }}
            >
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--s700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <span style={{ fontSize: 11.5, color: 'var(--s400)', whiteSpace: 'nowrap' }}>
                {new Date(n.scheduled_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
