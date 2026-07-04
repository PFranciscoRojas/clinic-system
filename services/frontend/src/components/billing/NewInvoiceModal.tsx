import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Search, AlertCircle, UserPlus, FileText } from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { serviceRatesApi } from '@/api/serviceRates';
import { authApi } from '@/api/auth';
import {
  invoicesApi, formatMoney,
  type BookingPayment, type Invoice,
} from '@/api/invoices';

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1.5px solid var(--s200)', borderRadius: 9, fontSize: 13, boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--s500)', marginBottom: 5, fontWeight: 500 };
const btn = (bg: string, disabled = false): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none',
  background: disabled ? 'var(--s200)' : bg, color: disabled ? 'var(--s400)' : '#fff',
  fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
});
const ghost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
  border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const patientName = (p: Patient) =>
  [p.first_name, p.middle_name, p.paternal_last_name, p.maternal_last_name].filter(Boolean).join(' ');

// Searchable patient picker: loads the org's patients once and filters
// client-side by name or document (the server-side search is exact-match only).
function PatientSelect({ value, onChange }: { value: Patient | null; onChange: (p: Patient | null) => void }) {
  const { data: patients, isLoading } = useQuery({
    queryKey: ['patients-picker'],
    queryFn: () => patientsApi.list({ limit: 500 }),
  });
  const [q, setQ] = useState('');

  const matches = useMemo(() => {
    const norm = q.trim().toLowerCase();
    if (!norm) return (patients ?? []).slice(0, 6);
    return (patients ?? [])
      .filter(p => patientName(p).toLowerCase().includes(norm) || p.document_number.includes(norm))
      .slice(0, 6);
  }, [patients, q]);

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--teal)', borderRadius: 9, padding: '8px 11px', background: '#f0fdfa' }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>
          {patientName(value)}
          <span style={{ fontWeight: 400, color: 'var(--s500)', marginLeft: 6, fontSize: 12 }}>{value.document_number}</span>
        </span>
        <button onClick={() => onChange(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex' }}>
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1.5px solid var(--s200)', borderRadius: 9, padding: '8px 11px' }}>
        <Search size={14} color="var(--s400)" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o documento…" autoFocus
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13 }} />
      </div>
      <div style={{ border: '1px solid var(--s100)', borderRadius: 9, marginTop: 6, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--s400)' }}>Cargando pacientes…</div>
        ) : matches.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--s400)' }}>Sin coincidencias.</div>
        ) : matches.map(p => (
          <button key={p.id} onClick={() => onChange(p)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none',
            borderBottom: '1px solid var(--s100)', background: '#fff', cursor: 'pointer', fontSize: 13,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
            <span style={{ fontWeight: 600, color: 'var(--s800)' }}>{patientName(p)}</span>
            <span style={{ color: 'var(--s400)', marginLeft: 8, fontSize: 12 }}>{p.document_number}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(520px, 100%)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderBottom: '1px solid var(--s100)' }}>
          <FileText size={17} color="var(--teal)" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--s800)' }}>{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '18px 22px' }}>{children}</div>
      </div>
    </div>
  );
}

// "Nueva factura" from the Facturación page: pick the patient, a rate (or a
// free amount) and create the invoice — issued right away by default.
export function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (inv: Invoice) => void }) {
  const { data: rates } = useQuery({ queryKey: ['service-rates'], queryFn: () => serviceRatesApi.list(false) });
  // Names for per-professional rates in the selector.
  const { data: profsRes } = useQuery({ queryKey: ['org-professionals'], queryFn: () => authApi.listProfessionals() });
  const profName: Record<string, string> = {};
  for (const p of profsRes?.items ?? []) profName[p.id] = p.name;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [rateId, setRateId] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [discount, setDiscount] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pickRate = (id: string) => {
    setRateId(id);
    const r = rates?.find(x => x.id === id);
    if (r) { setSubtotal(r.amount); setCurrency(r.currency); }
  };

  const save = async (issue: boolean) => {
    if (!patient) { setErr('Selecciona el paciente.'); return; }
    setBusy(true); setErr('');
    try {
      let inv = await invoicesApi.create({
        patient_id: patient.id,
        rate_id: rateId || null,
        currency,
        subtotal: subtotal.trim().replace(/\s/g, ''),
        discount: discount.trim().replace(/\s/g, '') || '0',
        notes: notes.trim(),
      });
      if (issue) inv = await invoicesApi.issue(inv.id);
      onCreated(inv);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'No se pudo crear la factura.');
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Nueva factura" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <div style={labelStyle}>Paciente</div>
          <PatientSelect value={patient} onChange={setPatient} />
        </div>
        <div>
          <div style={labelStyle}>Tarifa (opcional — autocompleta el monto)</div>
          <select value={rateId} onChange={e => pickRate(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">— Monto manual —</option>
            {(rates ?? []).map(r => <option key={r.id} value={r.id}>{r.name}{r.staff_id ? ` (${profName[r.staff_id] ?? 'profesional'})` : ''} · {formatMoney(r.amount, r.currency)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={labelStyle}>Subtotal</div>
            <input value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="180000" style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div>
            <div style={labelStyle}>Descuento (opcional)</div>
            <input value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
          </div>
        </div>
        <div>
          <div style={labelStyle}>Notas (opcional — visibles en el comprobante)</div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. Sesión individual 24 jun" style={inputStyle} />
        </div>
      </div>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}><AlertCircle size={13} />{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button disabled={busy} style={btn('#10b981', busy)} onClick={() => save(true)}>{busy ? 'Guardando…' : 'Crear y emitir'}</button>
        <button disabled={busy} style={ghost} onClick={() => save(false)}>Guardar como borrador</button>
        <button disabled={busy} style={{ ...ghost, marginLeft: 'auto' }} onClick={onClose}>Cancelar</button>
      </div>
    </ModalShell>
  );
}

// Generates the clinic's own invoice + receipt for a booking already paid via
// MercadoPago (insurance reimbursement, formal record). The guest has to be
// matched to a patient record first.
export function BookingInvoiceModal({ booking, onClose, onCreated }: {
  booking: BookingPayment; onClose: () => void; onCreated: (inv: Invoice) => void;
}) {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const confirm = async () => {
    if (!patient) { setErr('Selecciona el paciente al que corresponde esta reserva.'); return; }
    setBusy(true); setErr('');
    try {
      onCreated(await invoicesApi.createFromBooking(booking.id, patient.id));
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'No se pudo generar la factura.');
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Generar factura de la reserva" onClose={onClose}>
      <div style={{ background: 'var(--s50)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--s700)', marginBottom: 16, lineHeight: 1.7 }}>
        <strong>{booking.guest_name || 'Invitado'}</strong> pagó{' '}
        <strong style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(String(booking.amount), 'COP')}</strong> por MercadoPago.
        Se creará una factura con consecutivo, pagada, con la referencia de MercadoPago — lista para descargar o enviar el comprobante.
      </div>
      <div style={labelStyle}>¿A qué paciente corresponde?</div>
      <PatientSelect value={patient} onChange={setPatient} />
      <button onClick={() => navigate('/patients/new')} style={{
        display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: 0,
        marginTop: 10, fontSize: 12.5, color: 'var(--teal)', fontWeight: 600, cursor: 'pointer',
      }}>
        <UserPlus size={14} /> ¿Aún no tiene ficha? Crear paciente primero
      </button>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}><AlertCircle size={13} />{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button disabled={busy} style={btn('#10b981', busy)} onClick={confirm}>{busy ? 'Generando…' : 'Generar factura pagada'}</button>
        <button disabled={busy} style={ghost} onClick={onClose}>Cancelar</button>
      </div>
    </ModalShell>
  );
}
