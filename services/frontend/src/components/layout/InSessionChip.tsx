import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mic } from 'lucide-react';
import { appointmentsApi } from '@/api/appointments';
import { useAuth } from '@/context/AuthContext';

// Topbar shortcut back to the session currently in progress: the professional
// can wander anywhere in the app mid-session (check a record, the agenda) and
// always have a one-click way back to the appointment page.
export function InSessionChip() {
  const { user } = useAuth();
  const { data: current } = useQuery({
    queryKey: ['in-session', user?.user_id],
    queryFn: async () => {
      const items = await appointmentsApi.list({ staff_id: user!.user_id, status: 'IN_PROGRESS', limit: 1 });
      return items[0] ?? null;
    },
    enabled: !!user?.user_id && !user.roles?.includes('SYSTEM_ADMIN'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // `now` is read from state (set in an effect, never called mid-render) so
  // the remaining-minutes label stays honest without the render body calling
  // the impure Date.now() itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!current) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [current]);

  if (!current) return null;

  const start = new Date(current.started_at ?? current.scheduled_at).getTime();
  const remainMin = Math.ceil((start + current.duration_min * 60_000 - now) / 60_000);
  const over = remainMin <= 0;

  return (
    <Link
      to={`/appointments/${current.id}`}
      title="Volver a la sesión en curso"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none',
        padding: '7px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
        background: over ? '#fee2e2' : '#e8f2ec',
        border: `1.5px solid ${over ? '#fca5a5' : '#6ee7b7'}`,
        color: over ? '#991b1b' : '#065f46',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Mic size={13} />
        <span style={{ position: 'absolute', top: -2, right: -3, width: 6, height: 6, borderRadius: '50%', background: over ? '#dc2626' : '#059669' }} />
      </span>
      {over ? 'Sesión excedida' : `En sesión · ${remainMin} min`}
    </Link>
  );
}
