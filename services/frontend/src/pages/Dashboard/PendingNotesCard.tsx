import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { FileWarning } from 'lucide-react';
import { appointmentsApi } from '@/api/appointments';
import { patientsApi } from '@/api/patients';

// COMPLETED sessions (last 30 days) with neither a note nor an active AI
// draft — the ones the professional risks forgetting to close. Sessions with
// a live draft live in the Borradores IA surfaces instead (no duplicates).

export function usePendingNotes() {
  return useQuery({
    queryKey: ['pending-notes'],
    queryFn: appointmentsApi.pendingNotes,
    staleTime: 60_000,
  });
}

export function PendingNotesList() {
  const { data: items = [] } = usePendingNotes();

  const patients = useQueries({
    queries: items.map(n => ({
      queryKey: ['patient', n.patient_id],
      queryFn: () => patientsApi.get(n.patient_id),
      staleTime: 5 * 60_000,
    })),
  });

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((n, i) => {
        const p = patients[i]?.data;
        const name = p ? [p.first_name, p.paternal_last_name].filter(Boolean).join(' ') : '···';
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
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fee2e2', color: '#991b1b', whiteSpace: 'nowrap' }}>Sin nota</span>
          </Link>
        );
      })}
    </div>
  );
}

// Dashboard wrapper: amber call-to-action card, hidden when there's nothing pending.
export function PendingNotesCard() {
  const { data: items = [] } = usePendingNotes();
  if (items.length === 0) return null;

  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 20, border: '1px solid #fde68a', background: '#fffdf5' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FileWarning size={16} color="#d97706" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>
          Sesiones sin registro clínico
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, background: '#fde68a', color: '#78350f', borderRadius: 10, padding: '1px 8px' }}>{items.length}</span>
      </div>
      <PendingNotesList />
    </div>
  );
}
