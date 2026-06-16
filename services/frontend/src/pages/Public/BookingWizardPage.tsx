import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Video, MapPin, User, Mail, Phone, AlertTriangle, CheckCircle2, ChevronLeft } from 'lucide-react';
import { publicBookingApi, type DayAvailability } from '@/api/publicBooking';
import { splitName } from '@/api/profiles';

type Modality = 'VIRTUAL' | 'IN_PERSON';
type Step = 'modality' | 'slot' | 'data' | 'done';

// Public booking wizard (/book/:slug). No auth. Modality → real slot grid →
// contact details → request. Payment is added in a later phase.
export function BookingWizardPage() {
  const { slug = '' } = useParams();

  const [step, setStep] = useState<Step>('modality');
  const [modality, setModality] = useState<Modality>('VIRTUAL');
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 21 * 86400000).toISOString().slice(0, 10);

  // Load availability when entering the slot step or changing modality.
  useEffect(() => {
    if (step !== 'slot') return;
    setLoadingSlots(true); setNotFound(false);
    publicBookingApi.availability(slug, modality, from, to)
      .then(r => setDays(r.days ?? []))
      .catch((e) => { if (e?.status === 404) setNotFound(true); setDays([]); })
      .finally(() => setLoadingSlots(false));
  }, [step, modality, slug]);

  const submit = async () => {
    setErr('');
    if (!name.trim())                    { setErr('Ingresa tu nombre.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('Ingresa un correo válido.'); return; }
    if (!phone.trim())                   { setErr('Ingresa un teléfono.'); return; }
    if (!picked) { setStep('slot'); return; }
    setSaving(true);
    const [first, middle] = splitName(name.trim());
    const [paternal, maternal] = splitName(''); // last name optional from a single field
    try {
      await publicBookingApi.create({
        org_slug: slug,
        first_name: first || name.trim(),
        last_name: [middle, paternal, maternal].filter(Boolean).join(' ') || '—',
        email: email.trim(), phone: phone.trim(),
        modality,
        preferred_date: picked.date, preferred_time: picked.time,
      });
      setStep('done');
    } catch {
      setErr('No se pudo enviar tu reserva. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const fmtDay = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'linear-gradient(135deg, #0f766e, #134e4a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: '30px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.16)', width: '100%', maxWidth: 520, boxSizing: 'border-box' };
  const inputWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--s200)', borderRadius: 11, padding: '11px 14px', marginBottom: 12, background: '#fff' };
  const input: React.CSSProperties = { border: 'none', outline: 'none', flex: 1, fontSize: 14, color: 'var(--s800)', background: 'transparent' };

  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#fff' }}>Reserva tu cita</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>Elige modalidad y horario</div>
        </div>

        <div style={card}>
          {/* STEP 1 — modality */}
          {step === 'modality' && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--s700)', marginBottom: 14 }}>¿Cómo prefieres tu sesión?</div>
              {([['VIRTUAL', 'Online', 'Por videollamada', Video], ['IN_PERSON', 'Presencial', 'En el consultorio', MapPin]] as const).map(([val, title, sub, Icon]) => (
                <button key={val} onClick={() => { setModality(val); setStep('slot'); }} style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
                  border: `1.5px solid ${modality === val ? 'var(--teal)' : 'var(--s200)'}`, borderRadius: 12, padding: '16px 18px', marginBottom: 12, background: '#fff', cursor: 'pointer',
                }}>
                  <Icon size={22} color="var(--teal)" />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--s800)', fontSize: 15 }}>{title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--s500)' }}>{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* STEP 2 — slots */}
          {step === 'slot' && (
            <div>
              <button onClick={() => setStep('modality')} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: 'var(--teal)', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
                <ChevronLeft size={15} /> {modality === 'VIRTUAL' ? 'Online' : 'Presencial'} · cambiar
              </button>
              {loadingSlots ? (
                <div style={{ fontSize: 14, color: 'var(--s400)', padding: '20px 0', textAlign: 'center' }}>Cargando horarios…</div>
              ) : notFound ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'var(--s600)', padding: '16px 0' }}>
                  <AlertTriangle size={16} color="#f59e0b" /> No encontramos este consultorio.
                </div>
              ) : days.length === 0 ? (
                <div style={{ fontSize: 13.5, color: 'var(--s500)', padding: '16px 0' }}>No hay horarios disponibles en las próximas semanas. Intenta más tarde.</div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {days.map(d => (
                    <div key={d.date} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--s600)', textTransform: 'capitalize', marginBottom: 8 }}>{fmtDay(d.date)}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {d.slots.map(t => (
                          <button key={t} onClick={() => { setPicked({ date: d.date, time: t }); setStep('data'); }} style={{
                            border: '1.5px solid var(--s200)', borderRadius: 9, padding: '8px 14px', background: '#fff', color: 'var(--s700)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--teal)'; (e.currentTarget as HTMLElement).style.color = 'var(--teal)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--s200)'; (e.currentTarget as HTMLElement).style.color = 'var(--s700)'; }}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — data */}
          {step === 'data' && picked && (
            <div>
              <button onClick={() => setStep('slot')} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: 'var(--teal)', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 14, padding: 0 }}>
                <ChevronLeft size={15} /> Cambiar horario
              </button>
              <div style={{ background: 'var(--s50)', border: '1px solid var(--s200)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13.5, color: 'var(--s700)' }}>
                <strong style={{ textTransform: 'capitalize' }}>{fmtDay(picked.date)}</strong> · {picked.time} · {modality === 'VIRTUAL' ? 'Online' : 'Presencial'}
              </div>
              <div style={inputWrap}><User size={16} color="var(--s400)" /><input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" style={input} /></div>
              <div style={inputWrap}><Mail size={16} color="var(--s400)" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo electrónico" style={input} /></div>
              <div style={inputWrap}><Phone size={16} color="var(--s400)" /><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono" style={input} /></div>
              {err && <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 9, padding: '9px 12px', marginBottom: 14 }}><AlertTriangle size={14} />{err}</div>}
              <button onClick={submit} disabled={saving} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: saving ? 'var(--s300)' : 'var(--teal)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Enviando…' : 'Reservar cita'}
              </button>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && picked && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle2 size={46} color="#10b981" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--s800)', marginBottom: 10 }}>¡Reserva enviada!</div>
              <div style={{ fontSize: 13.5, color: 'var(--s500)', lineHeight: 1.7 }}>
                Tu solicitud para el <strong style={{ textTransform: 'capitalize' }}>{fmtDay(picked.date)}</strong> a las <strong>{picked.time}</strong> quedó registrada.
                Te escribiremos a <strong>{email.trim()}</strong> para confirmarla.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
