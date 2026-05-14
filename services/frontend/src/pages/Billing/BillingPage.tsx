import { useState, useMemo } from 'react';
import {
  Receipt, TrendingUp, CheckCircle, Clock, AlertCircle, Percent,
  BarChart2, Users, Search, Download, FileDown, Mail, CreditCard,
  PieChart, Plus, X, FileText, Send, XCircle, Check, Banknote, SearchX,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'cobrada' | 'pendiente' | 'vencida' | 'anulada';

interface Invoice {
  id:          string;
  patient:     string;
  initials:    string;
  color:       string;
  date:        string;
  due:         string;
  sessions:    number;
  amount:      number;
  status:      InvoiceStatus;
  method:      string | null;
  sessionType: string;
}

// ─── Static mock data ─────────────────────────────────────────────────────────

const MONTHLY = [
  { month: 'Nov', cobrado: 2500, pendiente: 300 },
  { month: 'Dic', cobrado: 2900, pendiente: 200 },
  { month: 'Ene', cobrado: 2400, pendiente: 200 },
  { month: 'Feb', cobrado: 3100, pendiente: 300 },
  { month: 'Mar', cobrado: 3500, pendiente: 300 },
  { month: 'Abr', cobrado: 3660, pendiente: 540 },
];

const INITIAL_INVOICES: Invoice[] = [
  { id: 'F-092', patient: 'Ana Ríos Castellanos',  initials: 'AR', color: '#6366f1', date: '24 may 2026', due: '07 jun 2026', sessions: 1, amount: 55000, status: 'pendiente', method: null,            sessionType: 'Sesión inicial'         },
  { id: 'F-091', patient: 'Carlos Mendoza Silva',  initials: 'CM', color: '#f59e0b', date: '22 may 2026', due: '05 jun 2026', sessions: 1, amount: 50000, status: 'pendiente', method: null,            sessionType: 'Seguimiento'            },
  { id: 'F-090', patient: 'Ana Ríos Castellanos',  initials: 'AR', color: '#6366f1', date: '17 may 2026', due: '31 may 2026', sessions: 1, amount: 55000, status: 'vencida',   method: null,            sessionType: 'Evaluación DASS-21'     },
  { id: 'F-089', patient: 'Rodrigo Parra Ibáñez', initials: 'RP', color: '#8b5cf6', date: '15 may 2026', due: '29 may 2026', sessions: 1, amount: 50000, status: 'cobrada',   method: 'Transferencia', sessionType: 'Sesión 12'              },
  { id: 'F-088', patient: 'Miguel Torres Vera',   initials: 'MT', color: '#f97316', date: '10 may 2026', due: '24 may 2026', sessions: 1, amount: 50000, status: 'cobrada',   method: 'Efectivo',      sessionType: 'Sesión 6'               },
  { id: 'F-087', patient: 'Isabella Cruz Mora',   initials: 'IC', color: '#ef4444', date: '08 may 2026', due: '22 may 2026', sessions: 1, amount: 60000, status: 'cobrada',   method: 'Tarjeta',       sessionType: 'Urgencia'               },
  { id: 'F-086', patient: 'Laura Vega Paredes',   initials: 'LV', color: '#10b981', date: '03 may 2026', due: '17 may 2026', sessions: 1, amount: 50000, status: 'cobrada',   method: 'Transferencia', sessionType: 'Sesión 3'               },
  { id: 'F-085', patient: 'Diego Rojas Fuentes',  initials: 'DR', color: '#0ea5e9', date: '01 may 2026', due: '15 may 2026', sessions: 1, amount: 50000, status: 'cobrada',   method: 'Efectivo',      sessionType: 'Sesión 2'               },
  { id: 'F-084', patient: 'Sofía Campos Ibáñez',  initials: 'SC', color: '#ec4899', date: '28 abr 2026', due: '12 may 2026', sessions: 1, amount: 50000, status: 'cobrada',   method: 'Tarjeta',       sessionType: 'Sesión 24'              },
  { id: 'F-083', patient: 'Carlos Mendoza Silva',  initials: 'CM', color: '#f59e0b', date: '25 abr 2026', due: '09 may 2026', sessions: 1, amount: 50000, status: 'cobrada',   method: 'Transferencia', sessionType: 'Seguimiento'            },
];

const PATIENTS_BALANCE = [
  { name: 'Ana Ríos Castellanos',  initials: 'AR', color: '#6366f1', total: 110000, cobrado:  55000, pendiente:  55000, sessions: 2  },
  { name: 'Carlos Mendoza Silva',  initials: 'CM', color: '#f59e0b', total: 100000, cobrado:  50000, pendiente:  50000, sessions: 2  },
  { name: 'Rodrigo Parra Ibáñez', initials: 'RP', color: '#8b5cf6', total: 600000, cobrado: 600000, pendiente:      0, sessions: 12 },
  { name: 'Miguel Torres Vera',   initials: 'MT', color: '#f97316', total: 300000, cobrado: 300000, pendiente:      0, sessions: 6  },
  { name: 'Isabella Cruz Mora',   initials: 'IC', color: '#ef4444', total: 120000, cobrado: 120000, pendiente:      0, sessions: 2  },
  { name: 'Laura Vega Paredes',   initials: 'LV', color: '#10b981', total: 150000, cobrado: 150000, pendiente:      0, sessions: 3  },
];

const PAYMENT_METHODS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Cheque', 'Seguro médico'];
const SESSION_PRICES: Record<string, number> = {
  'Sesión inicial':           55000,
  'Seguimiento':              50000,
  'Evaluación psicométrica':  60000,
  'Urgencia':                 70000,
  'Alta terapéutica':         50000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => '$' + n.toLocaleString('es-CO');

function currentMonth() {
  return new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<InvoiceStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  cobrada:   { label: 'Cobrada',   color: '#10b981', bg: '#ecfdf5', Icon: CheckCircle  },
  pendiente: { label: 'Pendiente', color: '#f59e0b', bg: '#fffbeb', Icon: Clock        },
  vencida:   { label: 'Vencida',   color: '#ef4444', bg: '#fef2f2', Icon: AlertCircle  },
  anulada:   { label: 'Anulada',   color: '#94a3b8', bg: '#f1f5f9', Icon: XCircle      },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: c.color, background: c.bg, borderRadius: 7, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      <c.Icon size={11} color={c.color} />{c.label}
    </span>
  );
}

// ─── ChartTooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string; fill?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--s700)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, background: p.color ?? p.fill }} />
          <span style={{ fontSize: 12, color: 'var(--s500)', flex: 1 }}>{p.name}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--s800)' }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── NuevaFacturaModal ────────────────────────────────────────────────────────

function NuevaFacturaModal({ nextId, onClose, onSave }: { nextId: string; onClose: () => void; onSave: () => void }) {
  const [patient, setPatient] = useState('');
  const [type,    setType]    = useState('Seguimiento');
  const [amount,  setAmount]  = useState(SESSION_PRICES['Seguimiento']);
  const [method,  setMethod]  = useState('Transferencia');
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [due,     setDue]     = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes,    setNotes]   = useState('');
  const [saving,   setSaving]  = useState(false);
  const [done,     setDone]    = useState(false);

  const PATIENT_NAMES = INITIAL_INVOICES
    .map(i => i.patient)
    .filter((v, i, a) => a.indexOf(v) === i);

  const handleType = (t: string) => { setType(t); setAmount(SESSION_PRICES[t] ?? 50000); };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setDone(true); }, 1400);
    setTimeout(() => { onSave(); }, 2600);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget && !done) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(0,0,0,0.20)', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
        {done ? (
          <div style={{ padding: '48px 40px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 99, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <CheckCircle size={32} color="#10b981" />
            </div>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--s800)', marginBottom: 8 }}>Factura generada</div>
            <div style={{ fontSize: 13.5, color: 'var(--s400)', lineHeight: 1.65 }}>
              La factura fue emitida y el paciente recibirá una copia por email.
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '22px 26px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Receipt size={20} color="var(--teal)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--s800)' }}>Nueva Factura</div>
                <div style={{ fontSize: 12.5, color: 'var(--s400)', marginTop: 2 }}>Emite un comprobante de pago para el paciente</div>
              </div>
              <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--s400)', display: 'flex', padding: 4, cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 26px' }}>
              {/* Patient */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>
                  Paciente <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={patient}
                  onChange={e => setPatient(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--s200)', borderRadius: 10, fontSize: 13.5, color: 'var(--s700)', background: '#fff' }}
                >
                  <option value="">Seleccionar paciente…</option>
                  {PATIENT_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Session type */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>Tipo de sesión</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                  {Object.entries(SESSION_PRICES).map(([t, p]) => {
                    const sel = type === t;
                    return (
                      <button
                        key={t}
                        onClick={() => handleType(t)}
                        style={{ padding: '10px 8px', borderRadius: 9, border: `1.5px solid ${sel ? 'var(--teal)' : 'var(--s200)'}`, background: sel ? 'var(--teal-l)' : '#fff', color: sel ? 'var(--teal-d)' : 'var(--s600)', fontSize: 11.5, fontWeight: sel ? 700 : 400, textAlign: 'center', transition: 'all .12s', cursor: 'pointer' }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, color: sel ? 'var(--teal)' : 'var(--s700)' }}>{fmt(p)}</div>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount + method */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Monto (COP)</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--s200)', borderRadius: 10, overflow: 'hidden' }}>
                    <span style={{ padding: '10px 12px', background: 'var(--s50)', fontSize: 13.5, fontWeight: 700, color: 'var(--s500)', borderRight: '1px solid var(--s200)' }}>$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(+e.target.value)}
                      style={{ flex: 1, border: 'none', padding: '10px 12px', fontSize: 13.5, color: 'var(--s800)', background: '#fff', outline: 'none' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Método de pago</label>
                  <select
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--s200)', borderRadius: 10, fontSize: 13.5, color: 'var(--s700)', background: '#fff' }}
                  >
                    {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Fecha de emisión</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--s200)', borderRadius: 10, fontSize: 13.5, color: 'var(--s700)', background: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Fecha de vencimiento</label>
                  <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--s200)', borderRadius: 10, fontSize: 13.5, color: 'var(--s700)', background: '#fff' }} />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Notas adicionales</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Descripción de servicios, número de sesión…"
                  style={{ width: '100%', border: '1.5px solid var(--s200)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--s800)', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                  onFocus={e => { e.target.style.borderColor = 'var(--teal)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'var(--s200)'; }}
                />
              </div>

              {/* Preview strip */}
              <div style={{ background: 'var(--s50)', borderRadius: 12, border: '1px solid var(--s200)', padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                <FileText size={20} color="var(--teal)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--s800)' }}>{nextId} · {patient || '—'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 2 }}>{type} · Vence {due || '—'}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--teal)', letterSpacing: '-0.5px' }}>{fmt(amount)}</div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onClose}
                  style={{ flex: 1, padding: 11, borderRadius: 11, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--s50)'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={!patient || saving}
                  style={{
                    flex: 2, padding: 11, borderRadius: 11, border: 'none',
                    background: patient ? 'linear-gradient(135deg, var(--teal), var(--teal-d))' : 'var(--s200)',
                    color: patient ? '#fff' : 'var(--s400)',
                    fontSize: 14, fontWeight: 800, cursor: patient ? 'pointer' : 'default',
                    boxShadow: patient ? '0 4px 14px rgba(14,118,110,0.35)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .15s',
                  }}
                >
                  {saving ? (
                    <><span style={{ width: 15, height: 15, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Emitiendo…</>
                  ) : (
                    <><Receipt size={15} color={patient ? 'white' : 'var(--s400)'} />Emitir factura</>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── InvoiceDetailModal ───────────────────────────────────────────────────────

function InvoiceDetailModal({
  invoice, onClose, onMarkPaid,
}: { invoice: Invoice; onClose: () => void; onMarkPaid: (id: string, method: string) => void }) {
  const [method,  setMethod]  = useState('Transferencia');
  const [marking, setMarking] = useState(false);
  const [marked,  setMarked]  = useState(false);

  const handleMarkPaid = () => {
    setMarking(true);
    setTimeout(() => { setMarking(false); setMarked(true); onMarkPaid(invoice.id, method); }, 1200);
  };

  const canPay = invoice.status === 'pendiente' || invoice.status === 'vencida';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, boxShadow: '0 24px 64px rgba(0,0,0,0.20)', overflow: 'hidden' }}>
        <div style={{ height: 5, background: 'linear-gradient(90deg, var(--teal), var(--teal-d))' }} />
        <div style={{ padding: '22px 26px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: 'var(--teal)', marginBottom: 4 }}>{invoice.id}</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--s800)', letterSpacing: '-0.3px' }}>{fmt(invoice.amount)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusBadge status={invoice.status} />
              <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--s400)', display: 'flex', padding: 4, cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Patient */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--s50)', borderRadius: 12, border: '1px solid var(--s200)', marginBottom: 18 }}>
            <div style={{ width: 40, height: 40, borderRadius: 99, background: invoice.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: invoice.color, flexShrink: 0 }}>
              {invoice.initials}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>{invoice.patient}</div>
              <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 2 }}>{invoice.sessionType}</div>
            </div>
          </div>

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--s200)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
            {[
              ['Fecha emisión', invoice.date],
              ['Vencimiento',   invoice.due],
              ['Tipo sesión',   invoice.sessionType],
              ['Método',        invoice.method ?? '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ background: '#fff', padding: '11px 14px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--s700)', marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Mark as paid */}
          {canPay && !marked && (
            <div style={{ padding: '14px 16px', background: '#f0fdf4', border: '1.5px solid #6ee7b7', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Banknote size={15} color="#10b981" />Registrar pago recibido
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #6ee7b7', borderRadius: 8, fontSize: 13, color: 'var(--s700)', background: '#fff' }}
                >
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
                <button
                  onClick={handleMarkPaid}
                  disabled={marking}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: marking ? 'var(--s200)' : '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: marking ? 'default' : 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}
                >
                  {marking
                    ? <span style={{ width: 14, height: 14, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />
                    : <Check size={13} color="white" />}
                  {marking ? '…' : 'Marcar cobrada'}
                </button>
              </div>
            </div>
          )}
          {marked && (
            <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1.5px solid #6ee7b7', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={16} color="#10b981" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>Pago registrado como {method}</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { Icon: Download, label: 'PDF'      },
              { Icon: Send,     label: 'Reenviar' },
            ].map(({ Icon, label }) => (
              <button
                key={label}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 500, color: 'var(--s600)', cursor: 'pointer', transition: 'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s50)'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <Icon size={14} />{label}
              </button>
            ))}
            <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1.5px solid #fecaca', background: '#fff7f7', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 500, color: '#ef4444', cursor: 'pointer' }}>
              <XCircle size={14} color="#ef4444" />Anular
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BillingPage ──────────────────────────────────────────────────────────────

type TabId = 'facturas' | 'resumen' | 'pacientes';

export function BillingPage() {
  const [tab,          setTab]          = useState<TabId>('facturas');
  const [invoices,     setInvoices]     = useState<Invoice[]>(INITIAL_INVOICES);
  const [showNew,      setShowNew]      = useState(false);
  const [selected,     setSelected]     = useState<Invoice | null>(null);
  const [filterStatus, setFilterStatus] = useState<'todos' | InvoiceStatus>('todos');
  const [search,       setSearch]       = useState('');
  const [searchFocus,  setSearchFocus]  = useState(false);

  const filtered = useMemo(() => invoices.filter(inv => {
    const matchStatus = filterStatus === 'todos' || inv.status === filterStatus;
    const matchSearch = inv.patient.toLowerCase().includes(search.toLowerCase()) || inv.id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  }), [invoices, filterStatus, search]);

  const handleMarkPaid = (id: string, method: string) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'cobrada', method } : inv));
  };

  // KPI calculations (current month = 'may')
  const totalMes    = invoices.filter(i => i.date.includes('may')).reduce((a, i) => a + i.amount, 0);
  const cobradoMes  = invoices.filter(i => i.status === 'cobrada' && i.date.includes('may')).reduce((a, i) => a + i.amount, 0);
  const pendienteMes = invoices.filter(i => i.status === 'pendiente').reduce((a, i) => a + i.amount, 0);
  const vencidoMes  = invoices.filter(i => i.status === 'vencida').reduce((a, i) => a + i.amount, 0);
  const pctCobrado  = totalMes > 0 ? Math.round((cobradoMes / totalMes) * 100) : 0;

  const nextId = `F-${String(invoices.length + 1).padStart(3, '0')}`;

  const TABS = [
    { id: 'facturas'  as TabId, icon: Receipt,   label: 'Facturas'           },
    { id: 'resumen'   as TabId, icon: BarChart2,  label: 'Resumen financiero' },
    { id: 'pacientes' as TabId, icon: Users,      label: 'Balance por paciente' },
  ];

  return (
    <>
      {showNew && (
        <NuevaFacturaModal
          nextId={nextId}
          onClose={() => setShowNew(false)}
          onSave={() => setShowNew(false)}
        />
      )}
      {selected && (
        <InvoiceDetailModal
          invoice={selected}
          onClose={() => setSelected(null)}
          onMarkPaid={(id, method) => { handleMarkPaid(id, method); }}
        />
      )}

      <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── KPI strip ───────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderBottom: '1px solid var(--s200)', padding: '12px 24px', display: 'flex', gap: 12, flexShrink: 0, overflowX: 'auto' }}>
          {([
            { label: 'Facturado este mes',   value: fmt(totalMes),    Icon: TrendingUp,  color: 'var(--teal)', bg: 'var(--teal-l)' },
            { label: 'Cobrado',              value: fmt(cobradoMes),  Icon: CheckCircle, color: '#10b981',     bg: '#ecfdf5'       },
            { label: 'Pendiente de cobro',   value: fmt(pendienteMes),Icon: Clock,       color: '#f59e0b',     bg: '#fffbeb'       },
            { label: 'Vencido',              value: fmt(vencidoMes),  Icon: AlertCircle, color: '#ef4444',     bg: '#fef2f2'       },
            { label: '% cobrado',            value: `${pctCobrado}%`, Icon: Percent,     color: '#8b5cf6',     bg: '#f5f3ff'       },
          ] as const).map(({ label, value, Icon, color, bg }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: bg, borderRadius: 12, border: `1px solid ${color}22`, flexShrink: 0, minWidth: 170 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flexShrink: 0 }}>
                <Icon size={16} color={color} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--s800)', letterSpacing: '-0.5px' }}>{value}</div>
                <div style={{ fontSize: 11.5, color: 'var(--s500)', marginTop: 1 }}>{label}</div>
              </div>
            </div>
          ))}

          {/* Nueva factura button */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              onClick={() => setShowNew(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, boxShadow: '0 2px 8px rgba(20,184,166,0.35)', transition: 'all .15s', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
            >
              <Plus size={15} color="white" />Nueva factura
            </button>
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderBottom: '1px solid var(--s200)', padding: '0 24px', display: 'flex', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16, borderRight: '1px solid var(--s200)', paddingRight: 16 }}>
            <Receipt size={15} color="var(--teal)" />
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>Facturación</span>
            <span style={{ fontSize: 12, color: 'var(--s400)' }}>/ {currentMonth()}</span>
          </div>
          {TABS.map(({ id, icon: Icon, label }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '13px 16px', border: 'none', background: 'transparent', color: on ? 'var(--teal-d)' : 'var(--s500)', fontWeight: on ? 700 : 400, fontSize: 13.5, borderBottom: `2px solid ${on ? 'var(--teal)' : 'transparent'}`, transition: 'all .15s', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <Icon size={14} color={on ? 'var(--teal)' : 'currentColor'} />
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* ── Tab: Facturas ──────────────────────────────────────────────────── */}
          {tab === 'facturas' && (
            <div style={{ padding: '22px 24px' }}>
              {/* Toolbar */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: searchFocus ? '#fff' : 'var(--s50)', border: `1.5px solid ${searchFocus ? 'var(--teal)' : 'var(--s200)'}`, borderRadius: 10, padding: '8px 13px', flex: 1, maxWidth: 320, transition: 'all .15s', boxShadow: searchFocus ? '0 0 0 3px rgba(20,184,166,0.12)' : 'none' }}>
                  <Search size={14} color={searchFocus ? 'var(--teal)' : 'var(--s400)'} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onFocus={() => setSearchFocus(true)}
                    onBlur={() => setSearchFocus(false)}
                    placeholder="Buscar factura o paciente…"
                    style={{ border: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--s700)', flex: 1, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {(['todos', 'cobrada', 'pendiente', 'vencida'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      style={{ padding: '6px 13px', borderRadius: 99, border: 'none', background: filterStatus === s ? 'var(--teal)' : 'var(--s100)', color: filterStatus === s ? '#fff' : 'var(--s500)', fontSize: 12.5, fontWeight: filterStatus === s ? 700 : 400, transition: 'all .12s', cursor: 'pointer', textTransform: 'capitalize' }}
                    >
                      {s === 'todos' ? 'Todas' : STATUS_CFG[s as InvoiceStatus]?.label ?? s}
                    </button>
                  ))}
                </div>

                <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--s400)' }}>{filtered.length} facturas</div>
                <button style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, color: 'var(--s600)', cursor: 'pointer' }}>
                  <Download size={13} />Exportar
                </button>
              </div>

              {/* Table */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 220px 1fr 100px 110px 120px 100px', padding: '10px 20px', background: 'var(--s50)', borderBottom: '1px solid var(--s100)' }}>
                  {['N°', 'Paciente', 'Servicio', 'Fecha', 'Vence', 'Monto', 'Estado'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</div>
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--s400)' }}>
                    <SearchX size={28} color="var(--s300)" style={{ margin: '0 auto 10px', display: 'block' }} />
                    <div style={{ fontSize: 14 }}>Sin resultados para este filtro</div>
                  </div>
                ) : filtered.map((inv, i) => (
                  <div
                    key={inv.id}
                    onClick={() => setSelected(inv)}
                    style={{ display: 'grid', gridTemplateColumns: '90px 220px 1fr 100px 110px 120px 100px', padding: '14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--s100)' : 'none', alignItems: 'center', cursor: 'pointer', transition: 'background .12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--s50)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12.5, fontWeight: 700, color: 'var(--teal)' }}>{inv.id}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 99, background: inv.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: inv.color, flexShrink: 0 }}>{inv.initials}</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.patient}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--s500)' }}>{inv.sessionType}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--s500)' }}>{inv.date.slice(0, 6)}</div>
                    <div style={{ fontSize: 12.5, color: inv.status === 'vencida' ? '#ef4444' : 'var(--s500)', fontWeight: inv.status === 'vencida' ? 700 : 400 }}>{inv.due.slice(0, 6)}</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--s800)', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' }}>{fmt(inv.amount)}</div>
                    <StatusBadge status={inv.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab: Resumen financiero ────────────────────────────────────────── */}
          {tab === 'resumen' && (
            <div style={{ padding: '22px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
                {/* Bar chart */}
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>Ingresos mensuales</div>
                      <div style={{ fontSize: 12.5, color: 'var(--s400)', marginTop: 3 }}>Noviembre 2025 — Mayo 2026</div>
                    </div>
                    <div style={{ display: 'flex', gap: 14 }}>
                      {[{ color: 'var(--teal)', label: 'Cobrado' }, { color: '#e2e8f0', label: 'Pendiente' }].map(l => (
                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                          <span style={{ fontSize: 12, color: 'var(--s500)' }}>{l.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={MONTHLY} margin={{ top: 0, right: 10, left: -10, bottom: 0 }} barSize={28} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v / 1000 + 'K'} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="cobrado" name="Cobrado" radius={[6, 6, 0, 0]}>
                        {MONTHLY.map((_, i) => (
                          <Cell key={i} fill={i === MONTHLY.length - 1 ? 'var(--teal-d)' : 'var(--teal)'} />
                        ))}
                      </Bar>
                      <Bar dataKey="pendiente" name="Pendiente" fill="#e2e8f0" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div style={{ marginTop: 16, padding: '11px 14px', background: 'var(--teal-l)', borderRadius: 9, border: '1px solid #99f6e4', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <TrendingUp size={15} color="var(--teal-d)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 13, color: 'var(--teal-d)', lineHeight: 1.6, margin: 0 }}>
                      <strong>+50% de crecimiento</strong> en 6 meses. Los ingresos de mayo están proyectados a superar el récord de abril una vez cobradas las facturas pendientes.
                    </p>
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Monthly breakdown */}
                  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <PieChart size={14} color="var(--teal)" />Mayo 2026
                    </div>
                    {[
                      { label: 'Total facturado', value: fmt(totalMes),    color: 'var(--s800)', size: 20, weight: 800 },
                      { label: 'Cobrado',          value: fmt(cobradoMes), color: '#10b981',     size: 15, weight: 700 },
                      { label: 'Pendiente',         value: fmt(pendienteMes), color: '#f59e0b',  size: 15, weight: 700 },
                      { label: 'Vencido',           value: fmt(vencidoMes), color: '#ef4444',    size: 15, weight: 700 },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: i === 0 ? '0 0 12px' : '8px 0', borderBottom: i === 0 ? '2px solid var(--s100)' : '1px solid var(--s50)', marginBottom: i === 0 ? 8 : 0 }}>
                        <span style={{ fontSize: 13, color: 'var(--s500)' }}>{r.label}</span>
                        <span style={{ fontSize: r.size, fontWeight: r.weight, color: r.color, fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' }}>{r.value}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--s500)' }}>% cobrado</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>{pctCobrado}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 99, background: 'var(--s100)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pctCobrado}%`, background: 'linear-gradient(90deg, var(--teal), var(--teal-d))', borderRadius: 99, transition: 'width .6s ease' }} />
                      </div>
                    </div>
                  </div>

                  {/* Payment methods */}
                  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <CreditCard size={14} color="var(--teal)" />Métodos de pago
                    </div>
                    {[
                      { method: 'Transferencia', pct: 55, color: 'var(--teal)' },
                      { method: 'Efectivo',      pct: 25, color: '#f59e0b'     },
                      { method: 'Tarjeta',       pct: 20, color: '#6366f1'     },
                    ].map((m, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: 'var(--s600)' }}>{m.method}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>{m.pct}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 99, background: 'var(--s100)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${m.pct}%`, background: m.color, borderRadius: 99, transition: 'width .6s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Quick actions */}
                  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--s700)', marginBottom: 10 }}>Acciones</div>
                    {[
                      { Icon: FileDown, label: 'Exportar informe mensual',  color: '#6366f1'     },
                      { Icon: Mail,     label: 'Enviar cobros pendientes',   color: '#f59e0b'     },
                      { Icon: BarChart2, label: 'Comparar con mes anterior', color: 'var(--teal)' },
                    ].map(({ Icon, label, color }, i) => (
                      <button
                        key={i}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--s100)', background: 'var(--s50)', fontSize: 13, color: 'var(--s700)', fontFamily: 'inherit', textAlign: 'left', marginBottom: i < 2 ? 6 : 0, transition: 'all .12s', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = color + '44'; e.currentTarget.style.background = color + '08'; e.currentTarget.style.color = color; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s100)'; e.currentTarget.style.background = 'var(--s50)'; e.currentTarget.style.color = 'var(--s700)'; }}
                      >
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={13} color={color} />
                        </div>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Balance por paciente ──────────────────────────────────────── */}
          {tab === 'pacientes' && (
            <div style={{ padding: '22px 24px' }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--s100)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={15} color="var(--teal)" />
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>Estado de cuenta por paciente</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '240px 80px 130px 120px 120px 1fr', padding: '9px 20px', background: 'var(--s50)', borderBottom: '1px solid var(--s100)' }}>
                  {['Paciente', 'Ses.', 'Total facturado', 'Cobrado', 'Pendiente', 'Estado'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</div>
                  ))}
                </div>
                {PATIENTS_BALANCE.map((p, i) => {
                  const pct = Math.round((p.cobrado / p.total) * 100);
                  return (
                    <div
                      key={i}
                      style={{ display: 'grid', gridTemplateColumns: '240px 80px 130px 120px 120px 1fr', padding: '16px 20px', borderBottom: i < PATIENTS_BALANCE.length - 1 ? '1px solid var(--s100)' : 'none', alignItems: 'center', transition: 'background .12s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--s50)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 99, background: p.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, color: p.color, flexShrink: 0 }}>{p.initials}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--s800)' }}>{p.name}</div>
                      </div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color: 'var(--s600)' }}>{p.sessions}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>{fmt(p.total)}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13.5, fontWeight: 700, color: '#10b981' }}>{fmt(p.cobrado)}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13.5, fontWeight: 700, color: p.pendiente > 0 ? '#f59e0b' : 'var(--s300)' }}>
                        {p.pendiente > 0 ? fmt(p.pendiente) : '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, maxWidth: 100, height: 6, borderRadius: 99, background: 'var(--s100)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : 'var(--teal)', borderRadius: 99, transition: 'width .5s ease' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? '#10b981' : 'var(--s500)' }}>{pct}%</span>
                        {pct === 100 && <CheckCircle size={14} color="#10b981" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
