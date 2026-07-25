import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Video, Check, Globe, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { leadBookingApi, type LeadBookResult } from '@/api/leadBooking';
import { BrandMark } from '@/components/ui/BrandMark';
import { useMediaQuery } from '@/lib/useMediaQuery';
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

// How far ahead the backend computes availability (leadbooking.maxWindowDays).
const WINDOW_DAYS = 45;
// The slot list is re-fetched on this cadence so a lead filling the form does
// not confirm a time somebody else just took.
const REFRESH_MS = 90_000;

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW_HEAD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];  // Monday-first, as in Colombia

// Local YYYY-MM-DD. toISOString() would shift the day in UTC-5.
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function labelDayLong(isoDate: string): string {
  const d = parseISO(isoDate);
  return `${DOW_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

function labelDayShort(isoDate: string): string {
  const d = parseISO(isoDate);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Calendar cells for one month, Monday-first, padded with nulls to full weeks.
function monthCells(cursor: Date): (Date | null)[] {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const shift = (new Date(y, m, 1).getDay() + 6) % 7;
  const total = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = Array(shift).fill(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Public lead agenda (/agenda). No auth. Product-branded (Chapni). A lead picks
// a free slot on the calendar, leaves their contact, and the call lands on the
// superadmin's Google Calendar with a Meet link.
export function LeadBookingPage() {
  // Availability is polled so a lead filling the form does not confirm a time
  // somebody else just took; it also refreshes when the tab regains focus.
  const { data, isPending, refetch } = useQuery({
    queryKey: ['lead-availability'],
    queryFn: () => leadBookingApi.availability(
      iso(new Date()),
      iso(new Date(Date.now() + WINDOW_DAYS * 86400000)),
    ),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });
  const durationMin = data?.duration_min ?? 30;
  const timezone = data?.timezone ?? 'America/Bogota';

  // null until the lead navigates: the shown month is then derived from the
  // first open day, so a month with no availability is never the landing view.
  const [monthCursor, setMonthCursor] = useState<Date | null>(null);
  const [selDate, setSelDate] = useState('');
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<LeadBookResult | null>(null);

  const isNarrow = useMediaQuery('(max-width: 1000px)');
  const isMobile = useMediaQuery('(max-width: 640px)');
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = 'Agenda una llamada · Chapni';
  }, []);

  // date → open slots, keeping only days that actually have room.
  const slotsByDate = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of data?.days ?? []) if (d.slots.length > 0) m.set(d.date, d.slots);
    return m;
  }, [data]);

  const [firstOpen, lastOpen] = useMemo(() => {
    const open = [...slotsByDate.keys()].sort();
    return open.length > 0
      ? [parseISO(open[0]), parseISO(open[open.length - 1])]
      : [null, null];
  }, [slotsByDate]);

  // A refresh may retire the chosen slot (somebody else booked it, or the day
  // rolled over). Drop the selection and say so rather than failing on submit.
  const staleSelection = picked !== null && !isPending && !(slotsByDate.get(picked.date) ?? []).includes(picked.time);
  const daySlots = slotsByDate.get(selDate) ?? [];

  const cursor = monthCursor ?? startOfMonth(firstOpen ?? new Date());
  const canPrev = cursor > startOfMonth(new Date());
  const canNext = lastOpen !== null && addMonths(cursor, 1) <= startOfMonth(lastOpen);

  function pickDay(d: string) {
    setSelDate(d);
    setPicked(null);
    setErr('');
  }

  function pickTime(t: string) {
    setPicked({ date: selDate, time: t });
    setErr('');
    // On a stacked layout the form lands below the fold — bring it into view
    // after the panel renders.
    if (isNarrow) {
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  async function submit() {
    if (!picked) return;
    setErr('');
    if (!name.trim() || !email.trim()) { setErr('Escribe tu nombre y tu correo.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Ese correo no parece válido.'); return; }
    setSaving(true);
    try {
      const res = await leadBookingApi.book({
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        message: message.trim(), date: picked.date, time: picked.time,
      });
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr('Ese horario se acaba de ocupar. Elige otro, por favor.');
        setPicked(null);
        void refetch();
      } else {
        setErr('No pudimos agendar. Intenta de nuevo en un momento.');
      }
    } finally {
      setSaving(false);
    }
  }

  const shell: React.CSSProperties = {
    minHeight: '100vh', background: PAPER, color: INK,
    fontFamily: 'Inter, system-ui, sans-serif',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: isMobile ? '20px 12px 40px' : '44px 20px 64px',
  };
  const card: React.CSSProperties = {
    width: '100%', maxWidth: picked && !isNarrow ? 1020 : 760,
    background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18,
    boxShadow: '0 12px 40px rgba(54,50,133,.09)', overflow: 'hidden',
    transition: 'max-width .25s ease',
  };

  if (result) {
    return (
      <div style={shell}>
        <div style={{ ...card, maxWidth: 560, padding: isMobile ? '32px 22px' : '44px 40px' }}>
          <Done result={result} tz={timezone} />
        </div>
      </div>
    );
  }

  const columns = isNarrow
    ? '1fr'
    : picked ? '250px 1fr 300px' : '250px 1fr';

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: columns }}>
          {/* ── Left: what is being booked ─────────────────────────────── */}
          <aside style={{
            padding: isMobile ? '24px 22px' : '30px 26px',
            borderRight: isNarrow ? 'none' : `1px solid ${LINE}`,
            borderBottom: isNarrow ? `1px solid ${LINE}` : 'none',
            background: '#fdfdff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: INDIGO }}>
              <BrandMark size={26} />
              <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.01em' }}>Chapni</span>
            </div>

            <h1 style={{ margin: '26px 0 18px', fontSize: 23, fontWeight: 800, lineHeight: 1.2, color: INDIGO }}>
              Llamada de descubrimiento
            </h1>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              <Meta icon={<Clock size={15} />} text={`${durationMin} min`} />
              <Meta icon={<Video size={15} />} text="Google Meet" />
              <Meta icon={<Globe size={15} />} text={`Hora de ${tzText(timezone)}`} />
              {picked && (
                <Meta
                  icon={<CalendarDays size={15} />}
                  text={`${picked.time} · ${labelDayLong(picked.date)}`}
                  strong
                />
              )}
            </ul>

            <p style={{ margin: '22px 0 0', fontSize: 13, lineHeight: 1.6, color: INK_SOFT }}>
              Una conversación corta para conocer tu consulta y mostrarte cómo Chapni te ayuda con la
              historia clínica, la agenda y el cumplimiento legal. Sin compromiso.
            </p>
          </aside>

          {/* ── Center: month calendar + time squares ──────────────────── */}
          <section style={{ padding: isMobile ? '24px 18px' : '30px 26px' }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 15.5, fontWeight: 700, color: INK }}>
              Elige día y hora
            </h2>

            {isPending ? (
              <p style={{ margin: 0, fontSize: 14, color: INK_SOFT }}>Cargando horarios disponibles…</p>
            ) : slotsByDate.size === 0 ? (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: INK_SOFT }}>
                No hay horarios disponibles en los próximos días. Escríbenos por WhatsApp y coordinamos
                una hora a la medida.
              </p>
            ) : (
              <>
                <div style={{ maxWidth: 350, margin: '0 auto' }}>
                <MonthNav
                  cursor={cursor} canPrev={canPrev} canNext={canNext}
                  onPrev={() => setMonthCursor(addMonths(cursor, -1))}
                  onNext={() => setMonthCursor(addMonths(cursor, 1))}
                />
                <MonthGrid
                  cursor={cursor} selDate={selDate} slotsByDate={slotsByDate}
                  onPick={pickDay}
                />

                {selDate && (
                  <div style={{ marginTop: 24 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 700, color: INK }}>
                      {labelDayLong(selDate)}
                    </p>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 8,
                      maxHeight: 214, overflowY: 'auto', paddingRight: 2,
                    }}>
                      {daySlots.map((t) => {
                        const sel = picked?.date === selDate && picked?.time === t;
                        return (
                          <button key={t} onClick={() => pickTime(t)}
                            style={{
                              padding: '11px 0', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                              fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                              border: `1.5px solid ${sel ? INDIGO : LINE}`,
                              background: sel ? INDIGO : '#fff',
                              color: sel ? '#fff' : INDIGO,
                            }}
                            onMouseEnter={(e) => { if (!sel) e.currentTarget.style.borderColor = GOLD; }}
                            onMouseLeave={(e) => { if (!sel) e.currentTarget.style.borderColor = LINE; }}>
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ margin: '12px 0 0', fontSize: 12, color: INK_SOFT }}>
                      Los horarios se muestran en hora de {tzText(timezone)}.
                    </p>
                  </div>
                )}

                {!selDate && (
                  <p style={{ margin: '20px 0 0', fontSize: 13.5, color: INK_SOFT }}>
                    Los días resaltados tienen horarios libres.
                  </p>
                )}
                </div>
              </>
            )}
          </section>

          {/* ── Right: contact form, appears once a time is chosen ─────── */}
          {picked && (
            <div ref={formRef} style={{
              padding: isMobile ? '24px 18px 28px' : '30px 26px',
              borderLeft: isNarrow ? 'none' : `1px solid ${LINE}`,
              borderTop: isNarrow ? `1px solid ${LINE}` : 'none',
              background: '#fdfdff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: INK }}>Tus datos</h2>
                <button onClick={() => setPicked(null)}
                  style={{ border: 'none', background: 'none', color: INDIGO_SOFT, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <ChevronLeft size={14} /> Cambiar hora
                </button>
              </div>
              <p style={{ margin: '0 0 18px', fontSize: 12.5, fontWeight: 600, color: INDIGO }}>
                {labelDayShort(picked.date)} · {picked.time}
              </p>

              {staleSelection ? (
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#b4232a' }}>
                  Ese horario se acaba de ocupar. Elige otro en el calendario, tus datos se conservan.
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 13 }}>
                    <Field label="Nombre" required>
                      <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Tu nombre" />
                    </Field>
                    <Field label="Correo" required>
                      <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="tu@correo.com" type="email" />
                    </Field>
                    <Field label="Teléfono">
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+57 300 000 0000" type="tel" />
                    </Field>
                    <Field label="¿Algo que quieras contarnos?">
                      <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                        style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
                        placeholder="Cuántos pacientes ves, qué usas hoy…" />
                    </Field>
                  </div>

                  {err && <p style={{ margin: '13px 0 0', fontSize: 13, lineHeight: 1.5, color: '#b4232a' }}>{err}</p>}

                  <button onClick={submit} disabled={saving}
                    style={{
                      marginTop: 18, width: '100%', padding: '13px 0', borderRadius: 11, border: 'none',
                      background: saving ? INDIGO_SOFT : INDIGO, color: '#fff', fontSize: 14.5, fontWeight: 700,
                      cursor: saving ? 'default' : 'pointer',
                    }}>
                    {saving ? 'Agendando…' : 'Confirmar la llamada'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 11px', borderRadius: 9, border: `1px solid ${LINE}`,
  fontSize: 13.5, color: INK, background: '#fff', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

// Accented Spanish names for the timezones the agenda settings offer; anything
// else falls back to the IANA city segment.
const TZ_CITY: Record<string, string> = {
  'America/Bogota': 'Bogotá',
  'America/Mexico_City': 'Ciudad de México',
  'America/Santiago': 'Santiago',
  'America/Lima': 'Lima',
  'America/Argentina/Buenos_Aires': 'Buenos Aires',
  'Europe/Madrid': 'Madrid',
};

// 'America/Bogota' → 'Bogotá (GMT-5)'.
function tzText(tz: string): string {
  const city = TZ_CITY[tz] ?? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
  try {
    const off = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value;
    return off ? `${city} (${off})` : city;
  } catch {
    return city;
  }
}

function Meta({ icon, text, strong }: { icon: React.ReactNode; text: string; strong?: boolean }) {
  return (
    <li style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5,
      color: strong ? INDIGO : INK_SOFT, fontWeight: strong ? 700 : 500, lineHeight: 1.4,
    }}>
      <span style={{ display: 'flex', paddingTop: 1, color: strong ? INDIGO : INDIGO_SOFT }}>{icon}</span>
      <span>{text}</span>
    </li>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>
        {label}{required && <span style={{ color: '#b4232a' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function MonthNav({ cursor, canPrev, canNext, onPrev, onNext }: {
  cursor: Date; canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void;
}) {
  const btn = (enabled: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 8, background: '#fff',
    border: `1px solid ${LINE}`, cursor: enabled ? 'pointer' : 'default',
    color: enabled ? INDIGO : '#c3bfd8',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: INK, textTransform: 'capitalize' }}>
        {MONTHS_LONG[cursor.getMonth()]} {cursor.getFullYear()}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onPrev} disabled={!canPrev} aria-label="Mes anterior" style={btn(canPrev)}>
          <ChevronLeft size={16} />
        </button>
        <button onClick={onNext} disabled={!canNext} aria-label="Mes siguiente" style={btn(canNext)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function MonthGrid({ cursor, selDate, slotsByDate, onPick }: {
  cursor: Date; selDate: string; slotsByDate: Map<string, string[]>; onPick: (d: string) => void;
}) {
  const cells = monthCells(cursor);
  const todayISO = iso(new Date());
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DOW_HEAD.map((d, i) => (
          <span key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase' }}>
            {d}
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const key = iso(d);
          const open = slotsByDate.has(key);
          const sel = key === selDate;
          const isToday = key === todayISO;
          return (
            <button key={key} onClick={() => open && onPick(key)} disabled={!open}
              aria-label={labelDayLong(key)} aria-current={isToday ? 'date' : undefined}
              style={{
                aspectRatio: '1 / 1', width: '100%', borderRadius: '50%', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13.5, fontWeight: open ? 700 : 500,
                fontVariantNumeric: 'tabular-nums',
                cursor: open ? 'pointer' : 'default',
                background: sel ? INDIGO : open ? '#eceafa' : 'transparent',
                color: sel ? '#fff' : open ? INDIGO : '#bdb9d0',
                boxShadow: isToday && !sel ? `inset 0 0 0 1.5px ${GOLD}` : 'none',
              }}
              onMouseEnter={(e) => { if (open && !sel) e.currentTarget.style.background = '#ddd9f5'; }}
              onMouseLeave={(e) => { if (open && !sel) e.currentTarget.style.background = '#eceafa'; }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Done({ result, tz }: { result: LeadBookResult; tz: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: INDIGO, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Check size={26} color="#fff" />
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: INDIGO }}>¡Listo! Tu llamada quedó agendada</h2>
      <p style={{ margin: '0 0 6px', fontSize: 15, color: INK }}>{result.when}</p>
      <p style={{ margin: 0, fontSize: 13.5, color: INK_SOFT }}>
        Hora de {tzText(tz)}. Te enviamos la confirmación por correo.
      </p>
      {result.meet_url && (
        <a href={result.meet_url} target="_blank" rel="noreferrer"
          style={{ marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 11, background: GOLD, color: INDIGO, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          <Video size={17} /> Entrar a la videollamada
        </a>
      )}
    </div>
  );
}
