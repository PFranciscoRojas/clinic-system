import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicBookingApi, type CreateBookingInput } from '@/api/bookingRequests';

// ─── Design tokens matching Marcela's site ────────────────────────────────────
const C = {
  sage:   '#3E5C4B',
  sageD:  '#2c4235',
  sageL:  '#f0f5f2',
  clay:   '#C2724E',
  cream:  '#FAF8F3',
  ink:    '#1a1a1a',
  muted:  '#6b7280',
  border: '#d4d4aa',
  white:  '#ffffff',
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: `1.5px solid ${C.border}`, fontSize: 15,
  background: C.white, color: C.ink, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'Mulish, sans-serif',
};

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700,
  color: C.sage, marginBottom: 5, fontFamily: 'Mulish, sans-serif',
};

// ─── Time slots ───────────────────────────────────────────────────────────────
const SLOTS = [
  '08:00', '09:00', '10:00', '11:00',
  '14:00', '15:00', '16:00', '17:00', '18:00',
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BookingPage() {
  const [searchParams] = useSearchParams();
  const orgSlug = searchParams.get('org') ?? 'default';

  const [step, setStep] = useState<'form' | 'success'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    modality: 'IN_PERSON' as 'IN_PERSON' | 'VIRTUAL',
    preferred_date: '', preferred_time: '', notes: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError('Nombre, apellido y correo son obligatorios.');
      return;
    }
    setSubmitting(true);
    try {
      const body: CreateBookingInput = {
        org_slug: orgSlug,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        modality: form.modality,
      };
      if (form.phone.trim())          body.phone          = form.phone.trim();
      if (form.preferred_date)        body.preferred_date = form.preferred_date;
      if (form.preferred_time)        body.preferred_time = form.preferred_time;
      if (form.notes.trim())          body.notes          = form.notes.trim();

      await publicBookingApi.create(body);
      setStep('success');
    } catch {
      setError('Ocurrió un error al enviar tu solicitud. Intenta de nuevo o escríbenos directamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.cream, fontFamily: 'Mulish, sans-serif', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ maxWidth: 520, margin: '0 auto 32px', textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22 }}>
          🌿
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>
          Marcela Chapués
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>Psicóloga Clínica · Bogotá</p>
      </div>

      {step === 'success' ? (
        <SuccessScreen />
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 520, margin: '0 auto', background: C.white, borderRadius: 18, padding: '32px 28px', boxShadow: '0 4px 24px rgba(62,92,75,0.10)' }}>

          <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>
            Agenda tu primera sesión
          </h2>
          <p style={{ margin: '0 0 28px', fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Cuéntame un poco sobre ti. Revisaré tu solicitud y me pondré en contacto en menos de 24 horas.
          </p>

          {/* Nombre + apellido */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={LABEL}>Nombre *</label>
              <input style={INPUT} placeholder="Tu nombre" value={form.first_name} onChange={set('first_name')} required />
            </div>
            <div>
              <label style={LABEL}>Apellido *</label>
              <input style={INPUT} placeholder="Tu apellido" value={form.last_name} onChange={set('last_name')} required />
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={LABEL}>Correo electrónico *</label>
            <input style={INPUT} type="email" placeholder="correo@ejemplo.com" value={form.email} onChange={set('email')} required />
          </div>

          {/* Teléfono */}
          <div style={{ marginBottom: 16 }}>
            <label style={LABEL}>WhatsApp / Teléfono</label>
            <input style={INPUT} type="tel" placeholder="+57 300 000 0000" value={form.phone} onChange={set('phone')} />
          </div>

          {/* Modalidad */}
          <div style={{ marginBottom: 20 }}>
            <label style={LABEL}>Modalidad</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['IN_PERSON', 'VIRTUAL'] as const).map(m => (
                <button
                  key={m} type="button"
                  onClick={() => setForm(p => ({ ...p, modality: m }))}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: '2px solid',
                    borderColor: form.modality === m ? C.sage : C.border,
                    background: form.modality === m ? C.sageL : C.white,
                    color: form.modality === m ? C.sage : C.muted,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Mulish, sans-serif',
                  }}
                >
                  {m === 'IN_PERSON' ? '🏢 Presencial' : '💻 Virtual'}
                </button>
              ))}
            </div>
            {form.modality === 'IN_PERSON' && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted }}>
                📍 Calle 93 # 14-20, Of. 306A, Chicó, Bogotá
              </p>
            )}
          </div>

          {/* Fecha y hora preferida */}
          <div style={{ background: C.sageL, borderRadius: 12, padding: '16px', marginBottom: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: C.sage }}>
              📅 Fecha y hora preferida <span style={{ fontWeight: 400, color: C.muted }}>(opcional)</span>
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ ...LABEL, color: C.muted }}>Fecha</label>
              <input
                style={INPUT} type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={form.preferred_date} onChange={set('preferred_date')}
              />
            </div>
            <div>
              <label style={{ ...LABEL, color: C.muted }}>Hora preferida</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SLOTS.map(s => (
                  <button
                    key={s} type="button"
                    onClick={() => setForm(p => ({ ...p, preferred_time: p.preferred_time === s ? '' : s }))}
                    style={{
                      padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                      borderColor: form.preferred_time === s ? C.sage : C.border,
                      background: form.preferred_time === s ? C.sage : C.white,
                      color: form.preferred_time === s ? C.white : C.muted,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Mulish, sans-serif',
                    }}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Notas */}
          <div style={{ marginBottom: 24 }}>
            <label style={LABEL}>¿Qué te trae aquí? <span style={{ fontWeight: 400, color: C.muted }}>(opcional)</span></label>
            <textarea
              style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }}
              rows={3}
              placeholder="Puedes contarme un poco sobre lo que estás viviendo, no hay respuesta incorrecta…"
              value={form.notes} onChange={set('notes')}
            />
          </div>

          {error && (
            <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: 12,
              background: submitting ? C.muted : C.sage, color: C.white,
              border: 'none', fontSize: 16, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'Fraunces, Georgia, serif', letterSpacing: '0.01em',
              transition: 'background 0.2s',
            }}
          >
            {submitting ? 'Enviando…' : 'Solicitar primera sesión →'}
          </button>

          <p style={{ margin: '16px 0 0', fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
            Tu información es confidencial y está protegida bajo la Ley 1581/2012.
            Te responderé en menos de 24 horas hábiles.
          </p>
        </form>
      )}
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', background: C.white, borderRadius: 18, padding: '48px 28px', boxShadow: '0 4px 24px rgba(62,92,75,0.10)', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 20 }}>🌱</div>
      <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>
        ¡Solicitud recibida!
      </h2>
      <p style={{ margin: '0 0 8px', fontSize: 15, color: C.muted, lineHeight: 1.7 }}>
        Gracias por dar este paso. He recibido tu solicitud y me pondré en contacto contigo en menos de 24 horas hábiles para confirmar fecha y hora.
      </p>
      <p style={{ margin: '16px 0 0', fontSize: 13, color: C.sage, fontWeight: 600 }}>
        — Marcela Chapués
      </p>
    </div>
  );
}
