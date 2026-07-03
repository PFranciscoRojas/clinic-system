import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Brain } from 'lucide-react';
import { aiDraftsApi, type DraftMeta } from '@/api/aiDrafts';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import { isPureAdmin } from '@/lib/clinicalAccess';

const DAY_MS = 24 * 60 * 60 * 1000;

// Topbar chip: the way back to an AI draft that is still generating (or that
// failed) after the professional navigated away from the session. Renders
// nothing when there is nothing in flight. Clicking goes straight to the
// draft's page (which live-polls its status) or, with several, to the
// clinical list.
export function AIDraftIndicator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Pure admins and the platform admin have no clinical access — the drafts
  // endpoint would reject them.
  const skip = !user || isPureAdmin(user.roles) || !!user.roles?.includes('SYSTEM_ADMIN');

  const { data: drafts = [], dataUpdatedAt } = useQuery({
    queryKey: ['ai-drafts-indicator'],
    queryFn: () => aiDraftsApi.list(),
    enabled: !skip,
    // Poll fast only while something is generating; otherwise a slow tick
    // just keeps the chip honest across tabs/devices.
    refetchInterval: (q) => {
      const items = q.state.data ?? [];
      return items.some(d => d.status === 'PENDING' || d.status === 'PROCESSING') ? 10_000 : 120_000;
    },
  });

  if (skip) return null;

  const inFlight = drafts.filter(d => d.status === 'PENDING' || d.status === 'PROCESSING');
  // Unresolved errors from the last 24h — old failures shouldn't nag forever.
  // Age is measured against the fetch timestamp (pure per render); the query
  // re-polls at most every 2 min, so the drift is negligible for a 24h window.
  const failed = drafts.filter(d =>
    d.status === 'ERROR' && !d.clinical_record_id &&
    dataUpdatedAt - new Date(d.created_at).getTime() < DAY_MS);

  if (inFlight.length === 0 && failed.length === 0) return null;

  const isError = inFlight.length === 0;
  const items = isError ? failed : inFlight;
  const goTo = (d: DraftMeta) =>
    navigate(`/ai-drafts/${d.id}${d.appointment_id ? `?appointment_id=${d.appointment_id}` : ''}`);

  return (
    <button
      onClick={() => (items.length === 1 ? goTo(items[0]) : navigate('/clinical'))}
      title={isError
        ? 'Un borrador de IA falló — haz clic para ver el detalle'
        : 'La IA está generando un borrador — haz clic para verlo'}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 13px', borderRadius: 10, cursor: 'pointer',
        fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
        border: `1.5px solid ${isError ? '#fca5a5' : '#fcd34d'}`,
        background: isError ? '#fee2e2' : '#fffbeb',
        color: isError ? '#991b1b' : '#92400e',
      }}
    >
      {isError ? <AlertTriangle size={14} /> : <Spinner size={13} color="#d97706" />}
      <Brain size={14} />
      {isError
        ? `Borrador con error${failed.length > 1 ? ` (${failed.length})` : ''}`
        : `Generando borrador${inFlight.length > 1 ? ` (${inFlight.length})` : '…'}`}
    </button>
  );
}
