import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, CalendarPlus, Download, XCircle } from 'lucide-react';
import { publicBookingApi } from '@/api/publicBooking';

const PAPER = '#faf6f1', INK = '#2a2420', INK_SOFT = '#6b5f55', ACCENT = '#8a5a5a', LINE = '#e6ddd2';
const DISPLAY = "'Fraunces', Georgia, serif";
const DURATION_MIN = 50;

type Booking = { status: string; modality: string; scheduled_at: string; clinic_name: string; org_slug: string };

// MercadoPago appends ?status= / ?collection_status= to the back URL. "Volver a
// la tienda" without paying lands here with a null/rejected/cancelled status, so
// we don't keep showing "confirming your payment" forever.
const FAILED_STATUSES = new Set(['null', 'rejected', 'cancelled', 'refunded', 'charged_back']);

// Landing after MercadoPago checkout (back_url = /book/return). MercadoPago
// appends ?external_reference=<booking_id>&status=...; the webhook confirms the
// booking server-side, so we poll the booking status and, once paid, show the
// confirmed appointment plus an add-to-calendar option.
export function BookingPaymentReturnPage() {
  const [params] = useSearchParams();
  const bookingId = params.get('external_reference') || '';
  const mpStatus = (params.get('status') || params.get('collection_status') || '').toLowerCase();
  // The patient came back without completing payment — don't poll, just offer a retry.
  const abandoned = !!mpStatus && FAILED_STATUSES.has(mpStatus);
  const [b, setB] = useState<Booking | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!bookingId || abandoned) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await publicBookingApi.status(bookingId);
        if (stop) return;
        setB(res);
        if (res.status !== 'PAID' && tries < 6) setTimeout(() => setTries(t => t + 1), 2500);
      } catch { /* not found yet */ if (!stop && tries < 6) setTimeout(() => setTries(t => t + 1), 2500); }
    };
    poll();
    return () => { stop = true; };
  }, [bookingId, tries, abandoned]);

  const paid = b?.status === 'PAID';
  // Not paid, and either the gateway reported a non-success status or polling ran out.
  const failed = !paid && (abandoned || tries >= 6);
  const retryHref = b?.org_slug ? `/book/${b.org_slug}` : '/';
  const start = b ? new Date(b.scheduled_at) : null;
  const end = start ? new Date(start.getTime() + DURATION_MIN * 60000) : null;
  const title = `Cita${b?.clinic_name ? ' · ' + b.clinic_name : ''}`;
  const ics = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const longDate = start
    ? start.toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

  const googleUrl = start && end
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${ics(start)}/${ics(end)}&details=${encodeURIComponent('Modalidad: ' + (b?.modality === 'VIRTUAL' ? 'Online' : 'Presencial'))}`
    : '#';

  const downloadIcs = () => {
    if (!start || !end) return;
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `DTSTART:${ics(start)}`, `DTEND:${ics(end)}`, `SUMMARY:${title}`, `DESCRIPTION:Modalidad ${b?.modality === 'VIRTUAL' ? 'Online' : 'Presencial'}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    const a = document.createElement('a'); a.href = url; a.download = 'cita.ics'; a.click(); URL.revokeObjectURL(url);
  };

  const calBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 11, border: `1.5px solid ${LINE}`, background: '#fff', color: INK, fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', marginTop: 10 };

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '40px 32px', boxShadow: '0 20px 60px rgba(42,36,32,0.12)', width: '100%', maxWidth: 460, textAlign: 'center', border: `1px solid ${LINE}`, boxSizing: 'border-box' }}>
        {paid
          ? <CheckCircle2 size={50} color="#3e6b4e" style={{ margin: '0 auto 16px' }} />
          : failed
            ? <XCircle size={50} color={ACCENT} style={{ margin: '0 auto 16px' }} />
            : <Clock size={50} color={ACCENT} style={{ margin: '0 auto 16px' }} />}
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, marginBottom: 12 }}>
          {paid ? '¡Cita confirmada!' : failed ? 'No se completó el pago' : 'Confirmando tu pago…'}
        </h1>
        {paid && start ? (
          <>
            <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7, marginBottom: 6, textTransform: 'capitalize' }}>{longDate}</p>
            <p style={{ color: INK_SOFT, fontSize: 13.5, marginBottom: 22 }}>{b?.modality === 'VIRTUAL' ? 'Online' : 'Presencial'} · te enviamos la confirmación por correo.</p>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK_SOFT, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>Agrégala a tu calendario</div>
            <a href={googleUrl} target="_blank" rel="noreferrer" style={calBtn}><CalendarPlus size={16} /> Google Calendar</a>
            <button onClick={downloadIcs} style={calBtn}><Download size={16} /> Apple / Outlook (.ics)</button>
          </>
        ) : failed ? (
          <>
            <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7, marginBottom: 20 }}>
              No registramos el pago, así que tu cita no quedó agendada. Tu horario sigue libre —
              puedes intentarlo de nuevo cuando quieras.
            </p>
            <a href={retryHref} style={{ display: 'inline-block', padding: '12px 22px', borderRadius: 11, background: ACCENT, color: '#fff', fontSize: 14.5, fontWeight: 600, textDecoration: 'none', fontFamily: DISPLAY }}>
              Volver a agendar
            </a>
          </>
        ) : (
          <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7 }}>
            Estamos confirmando tu pago con MercadoPago. En cuanto se acredite (unos segundos),
            tu cita quedará agendada y te llegará la confirmación por correo. Puedes cerrar esta página.
          </p>
        )}
      </div>
    </div>
  );
}
