import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Video, MapPin, User, Mail, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { publicBookingApi, type OrgInfo } from '@/api/publicBooking';

type Modality = 'VIRTUAL' | 'IN_PERSON';
type Step = 'modality' | 'slot' | 'data' | 'summary';
type Checkout = { init_point: string; summary: { date: string; time: string; modality: string; amount: number; currency: string } };

// Editorial palette mirroring marcelachapues.com.
const PAPER = '#faf6f1', INK = '#2a2420', INK_SOFT = '#6b5f55', INK_FAINT = '#a89c90', LINE = '#e6ddd2';
const DISPLAY = "'Fraunces', Georgia, serif";

const COUNTRY_CODES = ['+57', '+1', '+52', '+51', '+56', '+54', '+593', '+58', '+34'];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Public booking wizard (/book/:slug). No auth. Themed per tenant.
// modality → month calendar + slots → contact → request.
export function BookingWizardPage() {
  const { slug = '' } = useParams();

  const [info, setInfo] = useState<OrgInfo | null>(null);
  const [step, setStep] = useState<Step>('modality');
  const [modality, setModality] = useState<Modality>('VIRTUAL');
  const [byDate, setByDate] = useState<Record<string, string[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selDate, setSelDate] = useState<string>('');
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('+57');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);

  const accent = info?.brand_color && /^#[0-9a-fA-F]{3,8}$/.test(info.brand_color) ? info.brand_color : '#8a5a5a';
  const clinicName = info?.public_name || 'el consultorio';

  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);

  useEffect(() => { publicBookingApi.orgInfo(slug).then(setInfo).catch(() => {}); }, [slug]);

  // Load availability when entering the slot step or changing modality.
  useEffect(() => {
    if (step !== 'slot') return;
    setLoadingSlots(true); setNotFound(false); setSelDate('');
    publicBookingApi.availability(slug, modality, from, to)
      .then(r => {
        const map: Record<string, string[]> = {};
        (r.days ?? []).forEach(d => { map[d.date] = d.slots; });
        setByDate(map);
        const first = (r.days ?? [])[0]?.date;
        if (first) { setSelDate(first); const [y, m] = first.split('-').map(Number); setViewMonth({ y, m: m - 1 }); }
      })
      .catch((e) => { if (e?.status === 404) setNotFound(true); setByDate({}); })
      .finally(() => setLoadingSlots(false));
  }, [step, modality, slug]);

  const submit = async () => {
    setErr('');
    if (!name.trim()) { setErr('Ingresa tu nombre.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('Ingresa un correo válido.'); return; }
    if (!phone.trim()) { setErr('Ingresa un teléfono.'); return; }
    if (!picked) { setStep('slot'); return; }
    setSaving(true);
    try {
      const res = await publicBookingApi.checkout({
        org_slug: slug, modality, date: picked.date, time: picked.time,
        name: name.trim(), email: email.trim(), phone: `${code} ${phone.trim()}`,
      });
      setCheckout(res);
      setStep('summary');
    } catch (e: any) {
      setErr(e?.status === 409 ? 'Ese horario ya no está disponible. Elige otro.' : 'No se pudo iniciar la reserva. Inténtalo de nuevo.');
      if (e?.status === 409) setStep('slot');
    } finally { setSaving(false); }
  };

  const money = (n: number) => '$' + n.toLocaleString('es-CO') + ' COP';

  const fmtLongDay = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return `${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  };

  // Month grid cells (Mon-first), with availability flag.
  const cells = useMemo(() => {
    const { y, m } = viewMonth;
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday=0
    const days = new Date(y, m + 1, 0).getDate();
    const out: ({ date: string; day: number; has: boolean } | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ date: iso, day: d, has: (byDate[iso]?.length ?? 0) > 0 });
    }
    return out;
  }, [viewMonth, byDate]);

  const canPrev = (viewMonth.y > new Date().getFullYear()) || (viewMonth.m > new Date().getMonth());
  const shiftMonth = (delta: number) => setViewMonth(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  // ── styles ──
  const page: React.CSSProperties = { minHeight: '100vh', background: PAPER, color: INK, fontFamily: "'DM Sans', -apple-system, sans-serif", display: 'flex', alignItems: 'stretch' };
  const inputWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, border: `1.5px solid ${LINE}`, borderRadius: 10, padding: '11px 13px', marginBottom: 11, background: '#fff' };
  const input: React.CSSProperties = { border: 'none', outline: 'none', flex: 1, fontSize: 14.5, color: INK, background: 'transparent' };
  const chip = (active: boolean): React.CSSProperties => ({ border: `1.5px solid ${active ? accent : LINE}`, color: active ? '#fff' : INK, background: active ? accent : '#fff', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' });

  return (
    <div style={page} className="booking-page">
      {/* ── Hero panel (engaging) ── */}
      <div style={{ flex: '0 0 38%', maxWidth: 460, background: INK, color: PAPER, padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} className="booking-hero">
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: INK_FAINT }}>Reserva en línea</div>
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 38, lineHeight: 1.08, fontWeight: 500, marginBottom: 18 }}>
            El primer paso es <span style={{ fontStyle: 'italic', color: accent === '#8a5a5a' ? '#d9a7a7' : accent }}>agendar</span> una conversación.
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: '#d8cdc0', maxWidth: 320 }}>
            Una sesión de reconocimiento para vernos, contarme qué te trae y saber si podemos
            caminar juntos en este proceso.
          </p>
        </div>
        <div style={{ fontSize: 13, color: INK_FAINT }}>{clinicName}</div>
      </div>

      {/* ── Wizard ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 32px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 540 }}>

          {step === 'modality' && (
            <div>
              <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 27, marginBottom: 6 }}>Agenda tu cita</h1>
              <p style={{ color: INK_SOFT, fontSize: 14.5, marginBottom: 26 }}>¿Cómo prefieres tu sesión?</p>
              {([['VIRTUAL', 'Online', 'Por videollamada · mañana o tarde', Video], ['IN_PERSON', 'Presencial', 'En el consultorio · tardes', MapPin]] as const).map(([val, title, sub, Icon]) => (
                <button key={val} onClick={() => { setModality(val); setStep('slot'); }} style={{
                  display: 'flex', alignItems: 'center', gap: 16, width: '100%', textAlign: 'left',
                  border: `1.5px solid ${LINE}`, borderRadius: 13, padding: '18px 20px', marginBottom: 13, background: '#fff', cursor: 'pointer', transition: 'border-color .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = accent)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = LINE)}>
                  <Icon size={24} color={accent} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, fontFamily: DISPLAY }}>{title}</div>
                    <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 2 }}>{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'slot' && (
            <div>
              <button onClick={() => setStep('modality')} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: accent, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
                <ChevronLeft size={15} /> {modality === 'VIRTUAL' ? 'Online' : 'Presencial'} · cambiar
              </button>
              {loadingSlots ? (
                <div style={{ color: INK_FAINT, padding: '24px 0' }}>Cargando horarios…</div>
              ) : notFound ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: INK_SOFT, padding: '16px 0' }}><AlertTriangle size={16} color="#b45309" /> No encontramos este consultorio.</div>
              ) : Object.keys(byDate).length === 0 ? (
                <div style={{ color: INK_SOFT, padding: '16px 0' }}>No hay horarios disponibles en las próximas semanas.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }} className="booking-cal">
                  {/* Calendar */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <button onClick={() => canPrev && shiftMonth(-1)} disabled={!canPrev} style={{ border: 'none', background: 'none', cursor: canPrev ? 'pointer' : 'default', color: canPrev ? INK : INK_FAINT, display: 'flex', padding: 4 }}><ChevronLeft size={18} /></button>
                      <div style={{ fontFamily: DISPLAY, fontSize: 16, textTransform: 'capitalize' }}>{MONTHS[viewMonth.m]} {viewMonth.y}</div>
                      <button onClick={() => shiftMonth(1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: INK, display: 'flex', padding: 4 }}><ChevronRight size={18} /></button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, textAlign: 'center' }}>
                      {DOW.map((d, i) => <div key={i} style={{ fontSize: 10.5, color: INK_FAINT, fontWeight: 600, padding: '4px 0' }}>{d}</div>)}
                      {cells.map((c, i) => c === null ? <div key={i} /> : (
                        <button key={i} disabled={!c.has} onClick={() => setSelDate(c.date)} style={{
                          aspectRatio: '1', border: 'none', borderRadius: 8, fontSize: 13, cursor: c.has ? 'pointer' : 'default',
                          background: selDate === c.date ? accent : c.has ? '#fff' : 'transparent',
                          color: selDate === c.date ? '#fff' : c.has ? INK : INK_FAINT,
                          fontWeight: c.has ? 600 : 400, boxShadow: c.has && selDate !== c.date ? `inset 0 0 0 1.5px ${LINE}` : 'none',
                        }}>{c.day}</button>
                      ))}
                    </div>
                  </div>
                  {/* Slots for selected day */}
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: INK_SOFT, marginBottom: 12, minHeight: 18, textTransform: 'capitalize' }}>
                      {selDate ? fmtLongDay(selDate) : 'Elige un día'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                      {(byDate[selDate] ?? []).map(t => (
                        <button key={t} onClick={() => { setPicked({ date: selDate, time: t }); setStep('data'); }} style={chip(false)}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.color = INK; }}>{t}</button>
                      ))}
                      {selDate && (byDate[selDate]?.length ?? 0) === 0 && <div style={{ color: INK_FAINT, fontSize: 13 }}>Sin horarios este día.</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'data' && picked && (
            <div>
              <button onClick={() => setStep('slot')} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: accent, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 18, padding: 0 }}>
                <ChevronLeft size={15} /> Cambiar horario
              </button>
              <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 24, marginBottom: 14 }}>Tus datos</h1>
              <div style={{ background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 11, padding: '12px 15px', marginBottom: 18, fontSize: 14, color: INK }}>
                <strong style={{ textTransform: 'capitalize', fontFamily: DISPLAY }}>{fmtLongDay(picked.date)}</strong> · {picked.time} · {modality === 'VIRTUAL' ? 'Online' : 'Presencial'}
              </div>
              <div style={inputWrap}><User size={16} color={INK_FAINT} /><input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" style={input} /></div>
              <div style={inputWrap}><Mail size={16} color={INK_FAINT} /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo electrónico" style={input} /></div>
              <div style={{ ...inputWrap, paddingLeft: 4 }}>
                <select value={code} onChange={e => setCode(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: INK, padding: '0 6px', cursor: 'pointer' }}>
                  {COUNTRY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ width: 1, height: 20, background: LINE }} />
                <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ''))} placeholder="Teléfono" inputMode="numeric" style={input} />
              </div>
              {err && <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#a8443c', marginBottom: 14 }}><AlertTriangle size={14} />{err}</div>}
              <button onClick={submit} disabled={saving} style={{ width: '100%', padding: 14, borderRadius: 11, border: 'none', background: saving ? INK_FAINT : accent, color: '#fff', fontSize: 15, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', fontFamily: DISPLAY }}>
                {saving ? 'Un momento…' : 'Continuar al pago'}
              </button>
            </div>
          )}

          {step === 'summary' && picked && checkout && (
            <div>
              <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, marginBottom: 4 }}>Resumen de tu cita</h1>
              <p style={{ color: INK_SOFT, fontSize: 13.5, marginBottom: 20 }}>Revisa y continúa al pago seguro.</p>
              <div style={{ background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 13, overflow: 'hidden', marginBottom: 18 }}>
                {[['Fecha', fmtLongDay(picked.date)], ['Hora', picked.time], ['Modalidad', modality === 'VIRTUAL' ? 'Online' : 'Presencial'], ['Paciente', name.trim()]].map(([k, v], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderTop: i ? `1px solid ${LINE}` : 'none', fontSize: 14 }}>
                    <span style={{ color: INK_SOFT }}>{k}</span>
                    <span style={{ color: INK, fontWeight: 500, textTransform: k === 'Fecha' ? 'capitalize' : 'none' }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderTop: `1.5px solid ${LINE}`, background: PAPER }}>
                  <span style={{ fontWeight: 600, fontFamily: DISPLAY, fontSize: 15 }}>Total</span>
                  <span style={{ fontWeight: 700, fontFamily: DISPLAY, fontSize: 16, color: accent }}>{money(checkout.summary.amount)}</span>
                </div>
              </div>
              <button onClick={() => { window.location.href = checkout.init_point; }} style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', background: accent, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: DISPLAY }}>
                Pagar con MercadoPago
              </button>
              <p style={{ fontSize: 12, color: INK_FAINT, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
                Tu horario queda reservado por 15 minutos mientras completas el pago.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`@media (max-width: 760px){ .booking-page{ flex-direction:column !important; } .booking-hero{ flex-basis:auto !important; max-width:none !important; padding:28px 26px !important; } .booking-cal{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
