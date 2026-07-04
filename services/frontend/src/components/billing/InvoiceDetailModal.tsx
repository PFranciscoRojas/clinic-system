import { useEffect, useState } from 'react';
import { X, Download, Ban, CheckCircle, Plus, Send, AlertCircle, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import {
  invoicesApi, formatMoney, balanceOf, invoiceLabel,
  INVOICE_STATUS_META, PAYMENT_METHOD_LABELS, PAYMENT_REFERENCE_HINTS,
  type Invoice, type InvoiceStatus, type PaymentMethod,
} from '@/api/invoices';

const PAY_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'NEQUI', 'BREB', 'DAVIPLATA', 'DEBIT_CARD', 'CREDIT_CARD', 'PSE', 'INSURANCE_EPS', 'INSURANCE_PRIVATE', 'OTHER'];
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const btn = (bg: string, disabled = false): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none',
  background: disabled ? 'var(--s200)' : bg, color: disabled ? 'var(--s400)' : '#fff',
  fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
});
const ghost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
  border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1.5px solid var(--s200)', borderRadius: 9, fontSize: 13, boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--s500)', marginBottom: 5, fontWeight: 500 };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--s400)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{value}</div>
    </div>
  );
}

export function InvoiceDetailModal({ summary, onClose, onChange }: {
  summary: Invoice; onClose: () => void; onChange: () => void;
}) {
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  const canCreate = perms.includes('billing:create');
  const canPay = perms.includes('billing:record_payment');

  const [detail, setDetail] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [paying, setPaying] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sentMsg, setSentMsg] = useState('');

  const reload = () => invoicesApi.get(summary.id).then(setDetail).catch(() => {});
  useEffect(() => { reload(); }, [summary.id]);

  const inv = detail ?? summary;
  const meta = INVOICE_STATUS_META[inv.status as InvoiceStatus];
  const bal = balanceOf(inv);
  const payable = inv.status === 'ISSUED' || inv.status === 'PARTIAL';

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(''); setSentMsg('');
    try { await fn(); await reload(); onChange(); }
    catch (e) { setErr(e instanceof Error && e.message ? e.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };

  const downloadPdf = async () => {
    setBusy(true); setErr('');
    try {
      const blob = await invoicesApi.downloadReceipt(inv.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `comprobante-${invoiceLabel(inv)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { setErr('No se pudo generar el comprobante.'); }
    finally { setBusy(false); }
  };

  const doSend = async () => {
    setBusy(true); setErr(''); setConfirmSend(false);
    try {
      const r = await invoicesApi.send(inv.id);
      setSentMsg(`Comprobante enviado${r.email ? ` a ${r.email}` : ''}.`);
      await reload(); onChange();
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : 'No se pudo enviar el correo.'); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{invoiceLabel(inv)}</span>
              <Badge label={meta.label} color={meta.color} bg={meta.bg} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 2 }}>{summary.patient_name || '—'}{inv.service ? ` · ${inv.service}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)' }}><X size={20} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Field label="Fecha" value={fmtDate(inv.issued_at ?? inv.created_at)} />
            {inv.due_at && <Field label="Vence" value={fmtDate(inv.due_at)} />}
            <Field label="Subtotal" value={formatMoney(inv.subtotal, inv.currency)} />
            {Number(inv.discount) > 0 && <Field label="Descuento" value={`− ${formatMoney(inv.discount, inv.currency)}`} />}
            {Number(inv.insurance_covered) > 0 && <Field label="Cubre seguro" value={`− ${formatMoney(inv.insurance_covered, inv.currency)}`} />}
            <Field label="Total" value={formatMoney(inv.total_due, inv.currency)} />
            <Field label="Pagado" value={formatMoney(inv.total_paid, inv.currency)} />
            <Field label="Saldo" value={formatMoney(bal, inv.currency)} />
          </div>

          {inv.notes && <div style={{ fontSize: 12.5, color: 'var(--s600)', background: 'var(--s50)', borderRadius: 8, padding: '8px 11px', marginBottom: 14 }}>{inv.notes}</div>}

          {inv.payments && inv.payments.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 6 }}>Pagos</div>
              {inv.payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--s100)' }}>
                  <span style={{ color: 'var(--s600)' }}>{fmtDate(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.payment_method]}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span style={{ fontWeight: 600, color: '#065f46', fontFamily: "'DM Mono', monospace" }}>{formatMoney(p.amount, p.currency)}</span>
                </div>
              ))}
            </div>
          )}

          {inv.receipt_sent_at && (
            <div style={{ fontSize: 12, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Mail size={13} /> Comprobante enviado el {fmtDate(inv.receipt_sent_at)}
            </div>
          )}

          {err && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><AlertCircle size={13} />{err}</div>}
          {sentMsg && <div style={{ fontSize: 12.5, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><CheckCircle size={13} />{sentMsg}</div>}

          {paying && (
            <PaymentForm invoice={inv} balance={bal}
              onDone={async () => { setPaying(false); await reload(); onChange(); }}
              onCancel={() => setPaying(false)} />
          )}

          {/* Send confirmation */}
          {confirmSend && (
            <div style={{ padding: 14, background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 11, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#1e40af', marginBottom: 10 }}>¿Enviar el comprobante al correo del paciente?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy} style={btn('#2563eb', busy)} onClick={doSend}><Send size={14} /> Sí, enviar</button>
                <button disabled={busy} style={ghost} onClick={() => setConfirmSend(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!paying && !confirmSend && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {inv.status === 'DRAFT' && canCreate && (
                <button disabled={busy} style={btn('#0369a1', busy)} onClick={() => act(() => invoicesApi.issue(inv.id))}><CheckCircle size={14} /> Emitir</button>
              )}
              {payable && canPay && (
                <button style={btn('#10b981')} onClick={() => setPaying(true)}><Plus size={14} /> Registrar pago</button>
              )}
              {Number(inv.total_paid) > 0 && (
                <button disabled={busy} style={ghost} onClick={downloadPdf}><Download size={14} /> Ver PDF</button>
              )}
              {Number(inv.total_paid) > 0 && (
                <button disabled={busy} style={ghost} onClick={() => { setConfirmSend(true); setErr(''); setSentMsg(''); }}><Send size={14} /> Enviar al paciente</button>
              )}
              {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && canCreate && (
                <button disabled={busy} style={{ ...ghost, color: '#b91c1c', borderColor: '#fecaca' }}
                  onClick={() => { if (confirm('¿Anular esta factura?')) act(() => invoicesApi.cancel(inv.id)); }}>
                  <Ban size={14} /> Anular
                </button>
              )}
            </div>
          )}
        </div>
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
        amount: amount.trim().replace(/\s/g, ''), payment_method: method, reference: reference.trim() || undefined,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : 'No se pudo registrar el pago.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1.5px solid #6ee7b7', borderRadius: 11, background: '#ecfdf5', padding: 14, marginBottom: 12 }}>
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
          <div style={labelStyle}>Referencia (opcional, recomendada)</div>
          <input value={reference} onChange={e => setReference(e.target.value)}
            placeholder={PAYMENT_REFERENCE_HINTS[method] ?? 'N° de transacción o comprobante…'} style={inputStyle} />
        </div>
      </div>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}><AlertCircle size={13} />{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button disabled={busy} style={btn('#10b981', busy)} onClick={save}>{busy ? 'Guardando…' : 'Confirmar pago'}</button>
        <button disabled={busy} style={ghost} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
