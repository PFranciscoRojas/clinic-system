import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Sparkles, UserPlus, CalendarCheck, AlertTriangle, CheckCheck,
} from 'lucide-react';
import { notificationsApi, type Notification } from '@/api/notifications';

// Icon + accent per notification kind. Falls back to a neutral bell.
const KIND_STYLE: Record<string, { Icon: typeof Bell; color: string; bg: string }> = {
  AI_DRAFT_READY:   { Icon: Sparkles,      color: 'var(--teal)', bg: '#f3f2fb' },
  NEW_PATIENT:      { Icon: UserPlus,       color: 'var(--teal)', bg: '#f3f2fb' },
  BOOKING_NEW:      { Icon: CalendarCheck,  color: '#10b981',     bg: '#ecfdf5' },
  BOOKING_CONFLICT: { Icon: AlertTriangle,  color: '#dc2626',     bg: '#fef2f2' },
};

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'ahora';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Unread badge: polls in the background so the count stays live without a
  // socket. The list itself is only fetched while the panel is open.
  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationsApi.list(20),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
  };

  const onItem = async (n: Notification) => {
    if (!n.read_at) { await notificationsApi.markRead(n.id).catch(() => {}); refresh(); }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const onMarkAll = async () => {
    await notificationsApi.markAllRead().catch(() => {});
    refresh();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Notificaciones"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 10,
          background: open ? 'var(--s100)' : 'var(--s50)',
          border: '1.5px solid var(--s200)', cursor: 'pointer', transition: 'all .15s',
        }}
      >
        <Bell size={17} color="var(--s600)" />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9999,
            background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="anim-fade-in" style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340,
          maxWidth: 'calc(100vw - 24px)', background: '#fff', borderRadius: 12,
          border: '1px solid var(--s200)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--s100)' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--s800)' }}>Notificaciones</span>
            {items.some(n => !n.read_at) && (
              <button onClick={onMarkAll} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
                <CheckCheck size={13} /> Marcar todas
              </button>
            )}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--s400)', textAlign: 'center' }}>Cargando…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <Bell size={22} color="var(--s300)" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: 'var(--s400)' }}>Sin notificaciones</div>
              </div>
            ) : (
              items.map(n => {
                const style = KIND_STYLE[n.kind] ?? { Icon: Bell, color: 'var(--s500)', bg: 'var(--s100)' };
                const { Icon } = style;
                return (
                  <button key={n.id} onClick={() => onItem(n)} style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 11,
                    padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--s50)',
                    background: n.read_at ? '#fff' : 'var(--s25, #fafafe)', cursor: 'pointer', textAlign: 'left',
                    transition: 'background .12s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = n.read_at ? '#fff' : 'var(--s25, #fafafe)')}
                  >
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={15} color={style.color} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: n.read_at ? 500 : 700, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                        {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--s500)', lineHeight: 1.4, marginTop: 1 }}>{n.body}</div>
                      <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 3 }}>{relTime(n.created_at)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
