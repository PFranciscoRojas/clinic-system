import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';

const PAPER = '#faf6f1', INK = '#2a2420', INK_SOFT = '#6b5f55', ACCENT = '#8a5a5a';
const DISPLAY = "'Fraunces', Georgia, serif";

// Landing after MercadoPago checkout for an appointment (back_url = /book/return).
// MercadoPago appends ?status=approved|pending|failure. The webhook confirms the
// appointment server-side; this page just reassures the patient.
export function BookingPaymentReturnPage() {
  const [params] = useSearchParams();
  const status = params.get('status') || params.get('collection_status') || 'approved';
  const ok = status === 'approved';

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '40px 36px', boxShadow: '0 20px 60px rgba(42,36,32,0.12)', width: '100%', maxWidth: 460, textAlign: 'center', border: '1px solid #e6ddd2' }}>
        {ok ? <CheckCircle2 size={50} color="#3e6b4e" style={{ margin: '0 auto 16px' }} />
            : <Clock size={50} color={ACCENT} style={{ margin: '0 auto 16px' }} />}
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, marginBottom: 12 }}>
          {ok ? '¡Cita confirmada!' : 'Pago en proceso'}
        </h1>
        <p style={{ color: INK_SOFT, fontSize: 14.5, lineHeight: 1.7 }}>
          {ok
            ? 'Recibimos tu pago y tu cita quedó agendada. Te enviamos la confirmación por correo — ¡nos vemos pronto!'
            : 'Estamos confirmando tu pago con MercadoPago. En cuanto se acredite, tu cita quedará agendada y te llegará la confirmación por correo.'}
        </p>
      </div>
    </div>
  );
}
