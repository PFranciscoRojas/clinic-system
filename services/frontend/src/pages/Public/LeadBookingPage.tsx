import { useState, useEffect } from 'react';
import { Calendar, Clock, Video, Check, ChevronLeft } from 'lucide-react';
import { leadBookingApi, type DayAvailability, type LeadBookResult } from '@/api/leadBooking';
import { ApiError } from '@/api/client';

// Chapni brand palette (product-branded — this is the SaaS owner's sales agenda,
// not a tenant page). Indigo primary + warm gold accent, never white-on-gold.
const INDIGO = '#363285';
const INDIGO_SOFT = '#5b56b0';
const GOLD = '#c9a24b';
const PAPER = '#f7f6fb';
const INK = '#241f3d';
const INK_SOFT = '#6a6580';
const LINE = '#e4e1f2';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

type Step = 'slot' | 'data' | 'done';

function labelDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Public lead agenda (/agenda). No auth. Product-branded (Chapni). A lead picks
// a free slot, leaves their contact, and the call lands on the superadmin's
// Google Calendar with a Meet link.
export function LeadBookingPage() {
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selDate, setSelDate] = useState('');
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);
  const [step, setStep] = useState<Step>('slot');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<LeadBookResult | null>(null);

  useEffect(() => {
    document.title = 'Agenda una llamada · Chapni';
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
    leadBookingApi.availability(from, to)
      .then((r) => {
        setDays(r.days);
        if (r.days.length > 0) setSelDate(r.days[0].date);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dayObj = days.find((d) => d.date === selDate);

  async function submit() {
    if (!picked) return;
    setErr('');
    if (!name.trim() || !email.trim()) { setErr('Escribe tu nombre y correo.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Ese correo no parece válido.'); return; }
    setSaving(true);
    try {
      const res = await leadBookingApi.book({
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        message: message.trim(), date: picked.date, time: picked.time,
      });
      setResult(res);
      setStep('done');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr('Ese horario se acaba de ocupar. Elige otro, por favor.');
        setStep('slot');
      } else {
        setErr('No pudimos agendar. Intenta de nuevo en un momento.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 20px 64px', display: 'grid', gap: 40, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {/* Header */}
        <header>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: GOLD }}>Chapni</p>
          <h1 style={{ margin: '10px 0 8px', fontSize: 30, fontWeight: 800, lineHeight: 1.15, color: INDIGO }}>
            Agenda una llamada
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: INK_SOFT, maxWidth: 560 }}>
            Una conversación corta para conocer tu consulta y mostrarte cómo Chapni te ayuda con la
            historia clínica, la agenda y el cumplimiento legal. Sin compromiso.
          </p>
        </header>

        <main style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 28, boxShadow: '0 1px 2px rgba(54,50,133,.04)' }}>
          {step === 'done' && result ? (
            <Done result={result} />
          ) : step === 'data' && picked ? (
            <DataStep
              picked={picked} name={name} email={email} phone={phone} message={message}
              err={err} saving={saving}
              onBack={() => { setStep('slot'); setErr(''); }}
              setName={setName} setEmail={setEmail} setPhone={setPhone} setMessage={setMessage}
              onSubmit={submit}
            />
          ) : (
            <SlotStep
              loading={loading} days={days} selDate={selDate} dayObj={dayObj}
              err={err}
              onDay={setSelDate}
              onSlot={(t) => { setPicked({ date: selDate, time: t }); setStep('data'); setErr(''); }}
            />
          )}
        </main>

        <footer style={{ fontSize: 12.5, color: INK_SOFT, textAlign: 'center' }}>
          Chapni · Software para psicólogos en Colombia
        </footer>
      </div>
    </div>
  );
}

function SlotStep({ loading, days, selDate, dayObj, err, onDay, onSlot }: {
  loading: boolean; days: DayAvailability[]; selDate: string; dayObj?: DayAvailability;
  err: string; onDay: (d: string) => void; onSlot: (t: string) => void;
}) {
  if (loading) {
    return <p style={{ margin: 0, fontSize: 14, color: INK_SOFT }}>Cargando horarios disponibles…</p>;
  }
  if (days.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: INK_SOFT }}>
        No hay horarios disponibles en los próximos días. Escríbenos y coordinamos.
      </p>
    );
  }
  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: INDIGO, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Calendar size={14} /> Elige el día
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        {days.map((d) => {
          const sel = d.date === selDate;
          return (
            <button key={d.date} onClick={() => onDay(d.date)}
              style={{
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: `1px solid ${sel ? INDIGO : LINE}`, background: sel ? INDIGO : '#fff',
                color: sel ? '#fff' : INDIGO,
              }}>
              {labelDay(d.date)}
            </button>
          );
        })}
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: INDIGO, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={14} /> Elige la hora
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
        {dayObj?.slots.map((t) => (
          <button key={t} onClick={() => onSlot(t)}
            style={{
              padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              border: `1px solid ${LINE}`, background: '#fff', color: INDIGO,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; }}>
            {t}
          </button>
        ))}
      </div>
      {err && <p style={{ margin: '16px 0 0', fontSize: 13, color: '#b4232a' }}>{err}</p>}
    </div>
  );
}

function DataStep({ picked, name, email, phone, message, err, saving, onBack, setName, setEmail, setPhone, setMessage, onSubmit }: {
  picked: { date: string; time: string }; name: string; email: string; phone: string; message: string;
  err: string; saving: boolean; onBack: () => void;
  setName: (v: string) => void; setEmail: (v: string) => void; setPhone: (v: string) => void; setMessage: (v: string) => void;
  onSubmit: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 12px', borderRadius: 10, border: `1px solid ${LINE}`,
    fontSize: 14, color: INK, background: '#fff', boxSizing: 'border-box',
  };
  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: INDIGO_SOFT, cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 16 }}>
        <ChevronLeft size={16} /> Cambiar horario
      </button>
      <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', marginBottom: 20, fontSize: 14, color: INDIGO, fontWeight: 600 }}>
        {labelDay(picked.date)} · {picked.time} (hora de Colombia)
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Tu nombre" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>Correo</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="tu@correo.com" type="email" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>Teléfono (opcional)</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+57 300 000 0000" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>¿Algo que quieras contarnos? (opcional)</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} placeholder="Cuántos pacientes ves, qué usas hoy…" />
        </label>
      </div>

      {err && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#b4232a' }}>{err}</p>}

      <button onClick={onSubmit} disabled={saving}
        style={{
          marginTop: 20, width: '100%', padding: '13px 0', borderRadius: 11, border: 'none',
          background: saving ? INDIGO_SOFT : INDIGO, color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: saving ? 'default' : 'pointer',
        }}>
        {saving ? 'Agendando…' : 'Confirmar la llamada'}
      </button>
    </div>
  );
}

function Done({ result }: { result: LeadBookResult }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: INDIGO, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Check size={26} color="#fff" />
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: INDIGO }}>¡Listo! Tu llamada quedó agendada</h2>
      <p style={{ margin: '0 0 6px', fontSize: 15, color: INK }}>{result.when} (hora de Colombia)</p>
      <p style={{ margin: 0, fontSize: 14, color: INK_SOFT }}>Te enviamos la confirmación por correo.</p>
      {result.meet_url && (
        <a href={result.meet_url} target="_blank" rel="noreferrer"
          style={{ marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 11, background: GOLD, color: INDIGO, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          <Video size={17} /> Entrar a la videollamada
        </a>
      )}
    </div>
  );
}
