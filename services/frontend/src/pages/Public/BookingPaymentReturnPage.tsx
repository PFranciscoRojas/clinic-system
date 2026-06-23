import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, CalendarPlus, Download, XCircle, Receipt } from 'lucide-react';
import { publicBookingApi } from '@/api/publicBooking';
import { ApiError } from '@/api/client';

const PAPER = '#faf6f1', INK = '#2a2420', INK_SOFT = '#6b5f55', INK_FAINT = '#a89c90', ACCENT = '#8a5a5a', LINE = '#e6ddd2';
const DISPLAY = "'Fraunces', Georgia, serif";
const DURATION_MIN = 50;
const MAX_TRIES = 15; // ~45s of polling before we hand off to email confirmation

type Booking = {
  status: string; modality: string; scheduled_at: string; clinic_name: string;
  org_slug: string; website: string; payment_type: string; voucher_url: string; hold_expires_at: string;
};

// MercadoPago appends ?status= / ?collection_status= to the back URL. "Volver a
// la tienda" without paying lands here with a null/rejected/cancelled status, so
// we don't keep showing "confirming your payment" forever.
const FAILED_STATUSES = new Set(['null', 'rejected', 'cancelled', 'refunded', 'charged_back']);

// Landing after MercadoPago checkout (back_url = /book/return). MercadoPago
// appends ?external_reference=<booking_id>&status=...; the webhook confirms the
// booking server-side. We poll the booking status and branch into five states:
//   PAID          → appointment confirmed (+ add-to-calendar)
//   deferred      → pending + voucher (Efecty/cash): "reserva apartada, paga tu comprobante"
//   failed        → MP reported a failure, or the booking is gone (404 = rejected/released)
//   processing    → still pending after the poll window (we'll confirm by email)
//   confirming    → still polling
export function BookingPaymentReturnPage() {
  const [params] = useSearchParams();
  const bookingId = params.get('external_reference') || '';
  // back_url carries ?slug=<org_slug> so we can route the patient back to the
  // booking flow even before the status fetch resolves (or if it fails).
  const slugParam = params.get('slug') || '';
  const mpStatus = (params.get('status') || params.get('collection_status') || '').toLowerCase();
  // The patient came back without completing payment — don't poll, just offer a retry.
  const abandoned = !!mpStatus && FAILED_STATUSES.has(mpStatus);
  const [b, setB] = useState<Booking | null>(null);
  const [tries, setTries] = useState(0);
  const [notFound, setNotFound] = useState(false); // 404 → booking rejected/released
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (!bookingId || notFound) return;
    let stop = false;
    const fetchStatus = async () => {
      try {
        const res = await publicBookingApi.status(bookingId);
        if (stop) return;
        setB(res);
        // Done as far as polling goes: confirmed, or a voucher to pay later.
        const settled = res.status === 'PAID' || !!res.voucher_url;
        // Abandoned: fetch once (for the clinic's website) but don't poll.
        if (!abandoned && !settled && tries < MAX_TRIES) setTimeout(() => setTries(t => t + 1), 3000);
      } catch (e) {
        if (stop) return;
        // The booking no longer exists → it was rejected or released. Definitive.
        if (e instanceof ApiError && e.status === 404) { setNotFound(true); return; }
        if (!abandoned && tries < MAX_TRIES) setTimeout(() => setTries(t => t + 1), 3000);
      }
    };
    fetchStatus();
    return () => { stop = true; };
  }, [bookingId, tries, abandoned, notFound]);

  const paid = b?.status === 'PAID';
  // Pending offline payment (Efecty/cash): the slot is held, the voucher awaits payment.
  const deferred = !paid && !!b?.voucher_url;
  // Definitive failure: the gateway reported one, or the booking is gone.
  const failed = !paid && !deferred && (abandoned || notFound);
  // Still pending after the poll window — the webhook may still land; confirm by email.
  const processing = !paid && !deferred && !failed && tries >= MAX_TRIES;

  // Free the held slot when the patient explicitly abandoned (came back via
  // MercadoPago's failure status). A 404 means it's already gone; a timeout
  // (processing) must NOT release — the payment may still be accrediting.
  useEffect(() => {
    if (abandoned && bookingId && !released && !notFound) {
      setReleased(true);
      publicBookingApi.release(bookingId).catch(() => {});
    }
  }, [abandoned, bookingId, released, notFound]);

  // Send the patient back to the clinic's own site ("la tienda"), not the API host.
  // Prefer the configured website; otherwise reopen the booking flow by slug
  // (from the status response, falling back to the back_url's ?slug=).
  const slug = b?.org_slug || slugParam;
  const bookHref = slug ? `/book/${slug}` : '/';
  const retryHref = b?.website || bookHref;
  // After a confirmed appointment, "Finalizar" returns to the clinic's home page.
  const homeHref = b?.website || bookHref;
  const start = b ? new Date(b.scheduled_at) : null;
  const end = start ? new Date(start.getTime() + DURATION_MIN * 60000) : null;
  const title = `Cita${b?.clinic_name ? ' · ' + b.clinic_name : ''}`;
  const ics = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const fmt = (d: Date) => d.toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
  const longDate = start ? fmt(start) : '';
  const voucherDeadline = deferred && b?.hold_expires_at ? fmt(new Date(b.hold_expires_at)) : '';

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
  const primaryBtn: React.CSSProperties = { ...calBtn, background: ACCENT, color: '#fff', border: 'none', fontFamily: DISPLAY, fontSize: 15 };

  const heading = paid ? '¡Cita confirmada!'
    : deferred ? 'Reserva apartada'
    : failed ? 'No se completó el pago'
    : processing ? 'Estamos procesando tu pago'
    : 'Confirmando tu pago…';

  const icon = paid ? <CheckCircle2 size={50} color="#3e6b4e" style={{ margin: '0 auto 16px' }} />
    : deferred ? <Receipt size={50} color={ACCENT} style={{ margin: '0 auto 16px' }} />
    : failed ? <XCircle size={50} color={ACCENT} style={{ margin: '0 auto 16px' }} />
    : <Clock size={50} color={ACCENT} style={{ margin: '0 auto 16px' }} />;

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '40px 32px', boxShadow: '0 20px 60px rgba(42,36,32,0.12)', width: '100%', maxWidth: 460, textAlign: 'center', border: `1px solid ${LINE}`, boxSizing: 'border-box' }}>
        {icon}
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, marginBottom: 12 }}>{heading}</h1>

        {paid && start ? (
          <>
            <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7, marginBottom: 6, textTransform: 'capitalize' }}>{longDate}</p>
            <p style={{ color: INK_SOFT, fontSize: 13.5, marginBottom: 22 }}>{b?.modality === 'VIRTUAL' ? 'Online' : 'Presencial'} · te enviamos la confirmación por correo.</p>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK_SOFT, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>Agrégala a tu calendario</div>
            <a href={googleUrl} target="_blank" rel="noreferrer" style={calBtn}><CalendarPlus size={16} /> Google Calendar</a>
            <button onClick={downloadIcs} style={calBtn}><Download size={16} /> Apple / Outlook (.ics)</button>
            <p style={{ fontSize: 12, color: INK_FAINT, lineHeight: 1.5, margin: '18px 0 10px' }}>
              Guarda tu comprobante de pago. Cuando termines, finaliza:
            </p>
            <a href={homeHref} style={{ ...primaryBtn, marginTop: 0 }}>Finalizar</a>
          </>
        ) : deferred ? (
          <>
            <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7, marginBottom: 6, textTransform: 'capitalize' }}>{longDate}</p>
            <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7, marginBottom: 18 }}>
              Apartamos tu horario. Para confirmar la cita, paga tu comprobante
              {voucherDeadline ? <> antes del <strong style={{ textTransform: 'capitalize' }}>{voucherDeadline}</strong></> : null}.
              En cuanto se acredite el pago te enviaremos la confirmación por correo.
            </p>
            {b?.voucher_url ? (
              <a href={b.voucher_url} target="_blank" rel="noreferrer" style={{ ...primaryBtn, marginTop: 0 }}>
                <Receipt size={16} /> Ver / pagar mi comprobante
              </a>
            ) : null}
            <p style={{ fontSize: 12, color: INK_FAINT, lineHeight: 1.5, margin: '16px 0 0' }}>
              Si no pagas a tiempo, el horario se liberará automáticamente.
            </p>
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
        ) : processing ? (
          <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7 }}>
            Tu pago está en revisión por MercadoPago. En cuanto se acredite, tu cita quedará
            agendada y te enviaremos la confirmación por correo. Ya puedes cerrar esta página.
          </p>
        ) : (
          <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7 }}>
            Estamos confirmando tu pago con MercadoPago. En cuanto se acredite (unos segundos),
            tu cita quedará agendada y te llegará la confirmación por correo. Por favor, no cierres
            esta página hasta ver la confirmación.
          </p>
        )}
      </div>
    </div>
  );
}
