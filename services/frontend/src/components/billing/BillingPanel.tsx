import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Ban } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import {
  invoicesApi, formatMoney, balanceOf,
  INVOICE_STATUS_META, PAYMENT_METHOD_LABELS,
  type Invoice, type PaymentMethod,
} from '@/api/invoices';
import { serviceRatesApi } from '@/api/serviceRates';

const PAY_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'NEQUI', 'DAVIPLATA', 'DEBIT_CARD', 'CREDIT_CARD', 'PSE', 'INSURANCE_EPS', 'INSURANCE_PRIVATE', 'OTHER'];

const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const btn = (bg: string, disabled = false): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none',
  background: disabled ? 'var(--s200)' : bg, color: disabled ? 'var(--s400)' : '#fff',
  fontSize: 12.5, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
});
const ghostBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
  border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--s200)', borderRadius: 9,
  fontSize: 13, color: 'var(--s800)', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--s500)', marginBottom: 5, fontWeight: 500 };

export function BillingPanel({ patientId }: { patientId: string }) {
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  const canCreate = perms.includes('billing:create');
  const canPay = perms.includes('billing:record_payment');

  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['invoices', patientId] });

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['invoices', patientId],
    queryFn: () => invoicesApi.listByPatient(patientId),
  });

  const [showNew, setShowNew] = useState(false);

  if (isLoading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (error) return <div style={{ padding: 24, color: 'var(--red)', fontSize: 13.5 }}>No se pudieron cargar las facturas.</div>;

  const list = invoices ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, padding: '11px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 11, fontSize: 12.5, color: '#065f46', lineHeight: 1.5 }}>
        <Receipt size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Facturación interna del consultorio. Genera facturas y registra los pagos recibidos. No constituye facturación electrónica DIAN.</span>
      </div>

      {canCreate && !showNew && (
        <button onClick={() => setShowNew(true)} style={{ ...btn('#10b981'), marginBottom: 16 }}>
          <Plus size={15} /> Nueva factura
        </button>
      )}

      {showNew && <NewInvoiceForm patientId={patientId} onDone={() => { setShowNew(false); invalidate(); }} onCancel={() => setShowNew(false)} />}

      {list.length === 0 && !showNew && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--s400)', fontSize: 13.5 }}>
          Este paciente no tiene facturas todavía.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(inv => (
          <InvoiceCard key={inv.id} invoice={inv} canPay={canPay} canCreate={canCreate} onChange={invalidate} />
        ))}
      </div>
    </div>
  );
}

function InvoiceCard({ invoice, canPay, canCreate, onChange }: {
  invoice: Invoice; canPay: boolean; canCreate: boolean; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const meta = INVOICE_STATUS_META[invoice.status];
  const balance = balanceOf(invoice);
  const payable = invoice.status === 'ISSUED' || invoice.status === 'PARTIAL';

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try { setDetail(await invoicesApi.get(invoice.id)); } catch { /* keep summary */ }
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); onChange(); }
    catch (e) { setErr(e instanceof Error && e.message ? e.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1px solid var(--s200)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <button onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {open ? <ChevronDown size={16} color="var(--s400)" /> : <ChevronRight size={16} color="var(--s400)" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>
              {formatMoney(invoice.total_due, invoice.currency)}
            </span>
            <Badge label={meta.label} color={meta.color} bg={meta.bg} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 3 }}>
            Creada {fmtDate(invoice.created_at)}
            {payable && Number(balance) > 0 && <> · Saldo <b style={{ color: '#b45309' }}>{formatMoney(balance, invoice.currency)}</b></>}
            {invoice.status === 'PAID' && <> · Pagada completa</>}
          </div>
        </div>
      </button>

      {open && (
        <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--s100)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, padding: '12px 0' }}>
            <Field label="Subtotal" value={formatMoney(invoice.subtotal, invoice.currency)} />
            {Number(invoice.discount) > 0 && <Field label="Descuento" value={`− ${formatMoney(invoice.discount, invoice.currency)}`} />}
            {Number(invoice.insurance_covered) > 0 && <Field label="Cubre seguro" value={`− ${formatMoney(invoice.insurance_covered, invoice.currency)}`} />}
            <Field label="Total" value={formatMoney(invoice.total_due, invoice.currency)} />
            <Field label="Pagado" value={formatMoney(invoice.total_paid, invoice.currency)} />
            {invoice.due_at && <Field label="Vence" value={fmtDate(invoice.due_at)} />}
          </div>

          {detail?.notes && (
            <div style={{ fontSize: 12.5, color: 'var(--s600)', background: 'var(--s50)', borderRadius: 8, padding: '8px 11px', marginBottom: 10 }}>
              {detail.notes}
            </div>
          )}

          {detail?.payments && detail.payments.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 6 }}>Pagos</div>
              {detail.payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--s100)' }}>
                  <span style={{ color: 'var(--s600)' }}>{fmtDate(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.payment_method]}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span style={{ fontWeight: 600, color: '#065f46', fontFamily: "'DM Mono', monospace" }}>{formatMoney(p.amount, p.currency)}</span>
                </div>
              ))}
            </div>
          )}

          {err && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><AlertCircle size={13} />{err}</div>}

          {paying ? (
            <PaymentForm invoice={invoice} balance={balance}
              onDone={() => { setPaying(false); setDetail(null); onChange(); }}
              onCancel={() => setPaying(false)} />
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {invoice.status === 'DRAFT' && canCreate && (
                <button disabled={busy} style={btn('#0369a1', busy)} onClick={() => act(() => invoicesApi.issue(invoice.id))}>
                  <CheckCircle size={14} /> Emitir factura
                </button>
              )}
              {payable && canPay && (
                <button style={btn('#10b981')} onClick={() => setPaying(true)}>
                  <Plus size={14} /> Registrar pago
                </button>
              )}
              {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && canCreate && (
                <button disabled={busy} style={ghostBtn} onClick={() => { if (confirm('¿Anular esta factura?')) act(() => invoicesApi.cancel(invoice.id)); }}>
                  <Ban size={14} /> Anular
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--s400)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{value}</div>
    </div>
  );
}

function NewInvoiceForm({ patientId, onDone, onCancel }: { patientId: string; onDone: () => void; onCancel: () => void }) {
  const { data: rates } = useQuery({ queryKey: ['service-rates'], queryFn: () => serviceRatesApi.list(false) });
  const [rateId, setRateId] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [discount, setDiscount] = useState('');
  const [insurance, setInsurance] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pickRate = (id: string) => {
    setRateId(id);
    const r = rates?.find(x => x.id === id);
    if (r) { setSubtotal(r.amount); setCurrency(r.currency); }
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await invoicesApi.create({
        patient_id: patientId,
        rate_id: rateId || null,
        currency,
        subtotal: subtotal.trim().replace(/\s/g, ''),
        discount: discount.trim().replace(/\s/g, '') || '0',
        insurance_covered: insurance.trim().replace(/\s/g, '') || '0',
        notes: notes.trim(),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'No se pudo crear la factura.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1.5px solid var(--s200)', borderRadius: 12, background: 'var(--s50)', padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)', marginBottom: 14 }}>Nueva factura</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={labelStyle}>Tarifa (opcional — autocompleta el monto)</div>
          <select value={rateId} onChange={e => pickRate(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">— Monto manual —</option>
            {(rates ?? []).map(r => <option key={r.id} value={r.id}>{r.name} · {formatMoney(r.amount, r.currency)}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Subtotal</div>
          <input value={subtotal} onChange={e => setSubtotal(e.target.value)} placeholder="80000" style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
        </div>
        <div>
          <div style={labelStyle}>Moneda</div>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="COP">COP</option><option value="USD">USD</option><option value="EUR">EUR</option>
          </select>
        </div>
        <div>
          <div style={labelStyle}>Descuento (opcional)</div>
          <input value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
        </div>
        <div>
          <div style={labelStyle}>Cubre seguro (opcional)</div>
          <input value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="0" style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={labelStyle}>Notas (opcional)</div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalle visible en la factura" style={inputStyle} />
        </div>
      </div>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}><AlertCircle size={13} />{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button disabled={busy} style={btn('#10b981', busy)} onClick={save}>{busy ? 'Guardando…' : 'Crear factura'}</button>
        <button disabled={busy} style={ghostBtn} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function PaymentForm({ invoice, balance, onDone, onCancel }: {
  invoice: Invoice; balance: string; onDone: () => void; onCancel: () => void;
}) {
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await invoicesApi.recordPayment(invoice.id, {
        amount: amount.trim().replace(/\s/g, ''),
        payment_method: method,
        reference: reference.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'No se pudo registrar el pago.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1.5px solid #6ee7b7', borderRadius: 11, background: '#ecfdf5', padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 12 }}>Registrar pago · saldo {formatMoney(balance, invoice.currency)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={labelStyle}>Monto</div>
          <input value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, fontFamily: "'DM Mono', monospace" }} />
        </div>
        <div>
          <div style={labelStyle}>Medio de pago</div>
          <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {PAY_METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={labelStyle}>Referencia (opcional)</div>
          <input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° de transacción, comprobante…" style={inputStyle} />
        </div>
      </div>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}><AlertCircle size={13} />{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button disabled={busy} style={btn('#10b981', busy)} onClick={save}>{busy ? 'Guardando…' : 'Confirmar pago'}</button>
        <button disabled={busy} style={ghostBtn} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
