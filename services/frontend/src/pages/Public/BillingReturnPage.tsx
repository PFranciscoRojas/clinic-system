import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

// Landing reached after the MercadoPago hosted checkout (back_url). The
// subscription is confirmed asynchronously by the webhook, so we just reassure
// the user and send them back into the app, where /me will reflect the new
// status once the webhook lands (usually seconds).
export function BillingReturnPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(135deg, #0f766e, #134e4a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '36px 34px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--s800)', marginBottom: 10 }}>¡Gracias!</div>
        <div style={{ fontSize: 14, color: 'var(--s500)', lineHeight: 1.7, marginBottom: 24 }}>
          Estamos confirmando tu suscripción con MercadoPago. En unos segundos tu consultorio
          quedará activo — si no se refleja de inmediato, recarga la página en un momento.
        </div>
        <button onClick={() => navigate('/')} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          Ir a mi consultorio
        </button>
      </div>
    </div>
  );
}
