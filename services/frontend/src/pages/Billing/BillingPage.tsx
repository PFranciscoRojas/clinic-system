import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/lib/useMediaQuery';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Wallet, Clock, SearchX, ArrowUp, ArrowDown, Globe, HandCoins, FileText, BarChart3, AlertTriangle, Download, Send, CheckCircle, AlertCircle, Users, Plus, Stethoscope } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { InvoiceDetailModal } from '@/components/billing/InvoiceDetailModal';
import { NewInvoiceModal, BookingInvoiceModal } from '@/components/billing/NewInvoiceModal';
import {
  invoicesApi, formatMoney, invoiceLabel,
  INVOICE_STATUS_META, type Invoice, type InvoiceStatus,
  type BillingOverview, type BillingPeriod, type SeriesPoint, type MethodStat,
  type BookingPayment, type TeamMemberStats,
} from '@/api/invoices';
import { authApi } from '@/api/auth';
import { DEFAULT_SCHEDULE, isWorkingDay, type ScheduleConfig } from '@/lib/schedule';

const FILTERS: { id: string; label: string }[] = [
  { id: '',                 label: 'Todas'             },
  { id: 'ISSUED',           label: 'Emitidas'          },
  { id: 'PARTIAL',          label: 'Pago parcial'      },
  { id: 'PAID',             label: 'Pagadas'           },
  { id: 'PENDING_PAYMENT',  label: 'Pendiente de pago' },
  { id: 'DRAFT',            label: 'Borradores'        },
  { id: 'CANCELLED',        label: 'Anuladas'          },
];

type SortField = 'number' | 'name' | 'service' | 'date' | 'expires' | 'amount' | 'status';
type SortDir   = 'asc' | 'desc';
type AnyRow    = { _t: 'inv'; inv: Invoice } | { _t: 'bk'; bk: BookingPayment };

const bookingLabel = (n: number) => `R-${String(n).padStart(6, '0')}`;

const MP_REF_LABEL: Record<string, string> = {
  credit_card: 'Auth. MP', debit_card: 'Auth. MP',
  bank_transfer: 'CUS PSE', ticket: 'Cupón Efecty', atm: 'Ref. ATM', account_money: 'Ref. MP',
};

const PERIODS: { id: BillingPeriod; label: string; noun: string; chart: string }[] = [
  { id: 'week',    label: 'Semana',  noun: 'de la semana',   chart: 'esta semana (por día)' },
  { id: 'month',   label: 'Mes',     noun: 'del mes',        chart: 'este mes (por día)' },
  { id: 'quarter', label: '3 meses', noun: 'del trimestre',  chart: 'últimos 3 meses (por semana)' },
  { id: 'year',    label: 'Año',     noun: 'del año',        chart: 'este año (por mes)' },
  { id: 'all',     label: 'Todo',    noun: 'totales',        chart: 'histórico (por año)' },
];

const toCents = (s: string) => Math.round(parseFloat(s || '0') * 100);
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function deltaPct(cur: string, prev: string): number | null {
  const c = parseFloat(cur || '0'), p = parseFloat(prev || '0');
  if (p <= 0) return null;
  return Math.round(((c - p) / p) * 100);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Module-level KPI cards (driven by the period selector) ────────────────────
function KpiCards({ ov, period }: { ov?: BillingOverview; period: BillingPeriod }) {
  const cur = ov?.currency ?? 'COP';
  const noun = PERIODS.find(p => p.id === period)?.noun ?? '';
  const delta = ov?.has_delta ? deltaPct(ov.income, ov.income_prev) : null;
  const up = (delta ?? 0) >= 0;
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
      <div style={{ flex: 1.4, minWidth: 260, background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#10b9811a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wallet size={16} color="#10b981" /></div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--s500)' }}>Ingresos {noun} (cobrado)</span>
          {delta !== null && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: up ? '#059669' : '#dc2626' }}>
              {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(delta)}%
            </span>
          )}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{formatMoney(ov?.income ?? '0', cur)}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--s500)' }}><Globe size={13} color="#0ea5e9" /> Online <b style={{ color: 'var(--s700)' }}>{formatMoney(ov?.income_online ?? '0', cur)}</b></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--s500)' }}><HandCoins size={13} color="#10b981" /> Directo <b style={{ color: 'var(--s700)' }}>{formatMoney(ov?.income_direct ?? '0', cur)}</b></span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 180, background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#f59e0b1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Clock size={16} color="#f59e0b" /></div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--s500)' }}>Cartera</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{formatMoney(ov?.pending ?? '0', cur)}</div>
        <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 10 }}>{ov?.collected_pct ?? 0}% cobrado · facturado {formatMoney(ov?.invoiced ?? '0', cur)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 180, background: '#fff', border: `1px solid ${Number(ov?.overdue ?? 0) > 0 ? '#fecaca' : 'var(--s200)'}`, borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#ef44441a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={16} color="#ef4444" /></div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--s500)' }}>Vencido</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: Number(ov?.overdue ?? 0) > 0 ? '#b91c1c' : 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{formatMoney(ov?.overdue ?? '0', cur)}</div>
        <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 10 }}>{ov?.overdue_count ?? 0} factura(s) vencida(s)</div>
      </div>
    </div>
  );
}

const MP_TYPE_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta crédito', debit_card: 'Tarjeta débito',
  bank_transfer: 'PSE', ticket: 'Efecty', atm: 'ATM', account_money: 'Cuenta MP',
};
const MODALITY_LABEL: Record<string, string> = {
  IN_PERSON: 'Presencial', VIRTUAL: 'Virtual', HYBRID: 'Híbrida',
};

const fmtDateTime = (s?: string | null) => s
  ? new Date(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

function BookingDetailModal({ booking, onClose, onGenerateInvoice }: {
  booking: BookingPayment; onClose: () => void; onGenerateInvoice?: () => void;
}) {
  const paid = booking.status === 'PAID';
  const row = (label: string, value: React.ReactNode) => value ? (
    <div style={{ display: 'flex', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--s100)' }}>
      <span style={{ minWidth: 140, fontSize: 12, color: 'var(--s500)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--s800)', flex: 1 }}>{value}</span>
    </div>
  ) : null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: 460, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, background: '#e0f2fe', color: '#0369a1' }}>Reserva online</span>
            <Badge label={paid ? 'Pagada' : 'Pendiente de pago'} color={paid ? '#065f46' : '#92400e'} bg={paid ? '#d1fae5' : '#fef3c7'} />
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--s400)', lineHeight: 1 }}>×</button>
        </div>

        {row('Invitado', <strong>{booking.guest_name || '—'}</strong>)}
        {row('Correo', booking.email)}
        {row('Teléfono', booking.phone)}
        {row('Fecha de cita', fmtDateTime(booking.scheduled_at))}
        {row('Modalidad', MODALITY_LABEL[booking.modality] ?? (booking.modality || null))}
        {row('Monto', <strong style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(String(booking.amount), 'COP')}</strong>)}
        {row('Método de pago', booking.payment_type ? (MP_TYPE_LABEL[booking.payment_type] ?? booking.payment_type) : null)}
        {!paid && booking.hold_expires_at && row('Vence el', <span style={{ color: '#92400e', fontWeight: 600 }}>{fmtDateTime(booking.hold_expires_at)}</span>)}
        {paid && booking.paid_at && row('Pagó el', fmtDateTime(booking.paid_at))}
        {paid && booking.mp_payment_id && row(
          MP_REF_LABEL[booking.payment_type] ?? 'Ref. pago',
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12.5, userSelect: 'all' }}>{booking.mp_payment_id}</span>
        )}
        {booking.voucher_url && row('Comprobante', <a href={booking.voucher_url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', fontWeight: 600 }}>Ver comprobante →</a>)}
        {booking.invoice_number != null && row('Factura Chapni',
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#065f46' }}>F-{String(booking.invoice_number).padStart(6, '0')}</span>)}
        {onGenerateInvoice && (
          <div style={{ marginTop: 16 }}>
            <button onClick={onGenerateInvoice} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none',
              background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}><FileText size={14} /> Generar factura Chapni</button>
            <div style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 6, lineHeight: 1.5 }}>
              Crea una factura pagada con consecutivo para entregar el comprobante del consultorio (reembolsos, soporte formal).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Facturas tab ──────────────────────────────────────────────────────────────
function FacturasTab({ period }: { period: BillingPeriod }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canCreate = (user?.permissions ?? []).includes('billing:create');

  const [filter, setFilter]               = useState('');
  const [selected, setSelected]           = useState<Invoice | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingPayment | null>(null);
  const [showNew, setShowNew]             = useState(false);
  const [invoicing, setInvoicing]         = useState<BookingPayment | null>(null);
  const [sortField, setSortField]         = useState<SortField>('date');
  const [sortDir, setSortDir]             = useState<SortDir>('desc');

  const reloadAll = () => {
    qc.invalidateQueries({ queryKey: ['invoices-all'] });
    qc.invalidateQueries({ queryKey: ['bookings-revenue'] });
    qc.invalidateQueries({ queryKey: ['billing-overview'] });
  };

  const isPendingFilter = filter === 'PENDING_PAYMENT';

  const { data: invoices, isLoading: loadingInv, refetch } = useQuery({
    queryKey: ['invoices-all', filter, period],
    queryFn:  () => invoicesApi.listAll(filter || undefined, period),
    enabled:  !isPendingFilter,
  });

  const showBookings = filter === '' || filter === 'PAID' || isPendingFilter;
  const bkApiStatus  = filter === 'PAID' ? 'PAID' : isPendingFilter ? 'PENDING_PAYMENT' : undefined;
  const { data: bookings, isLoading: loadingBook } = useQuery({
    queryKey: ['bookings-revenue', bkApiStatus, period],
    queryFn:  () => invoicesApi.listBookings(bkApiStatus, period),
    enabled:  showBookings,
  });

  const invList = isPendingFilter ? [] : (invoices ?? []);
  const bkList  = showBookings ? (bookings ?? []) : [];

  const allRows: AnyRow[] = [
    ...invList.map(inv => ({ _t: 'inv' as const, inv })),
    ...bkList.map(bk  => ({ _t: 'bk'  as const, bk  })),
  ];

  const rowVal = (r: AnyRow): string | number => {
    if (r._t === 'inv') {
      const inv = r.inv;
      switch (sortField) {
        case 'number':  return inv.invoice_number ?? 0;
        case 'name':    return (inv.patient_name ?? '').toLowerCase();
        case 'service': return (inv.service ?? '').toLowerCase();
        case 'date':    return new Date(inv.issued_at ?? inv.created_at).getTime();
        case 'expires': return inv.due_at ? new Date(inv.due_at).getTime() : 0;
        case 'amount':  return parseFloat(inv.total_due);
        case 'status':  return inv.status;
      }
    } else {
      const bk = r.bk;
      switch (sortField) {
        case 'number':  return bk.booking_number;
        case 'name':    return bk.guest_name.toLowerCase();
        case 'service': return bk.payment_type.toLowerCase();
        case 'date':    return new Date(bk.scheduled_at).getTime();
        case 'expires': return bk.hold_expires_at ? new Date(bk.hold_expires_at).getTime() : 0;
        case 'amount':  return bk.amount;
        case 'status':  return bk.status;
      }
    }
  };

  const sortedRows = [...allRows].sort((a, b) => {
    const av = rowVal(a), bv = rowVal(b);
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'es');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const isLoading = (isPendingFilter ? false : loadingInv) || loadingBook;

  const sortIcon = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const exportCsv = () => {
    const rows = sortedRows.map(r => {
      if (r._t === 'inv') {
        const inv = r.inv;
        return [invoiceLabel(inv), inv.patient_name || '', inv.service || '',
          fmtDate(inv.issued_at ?? inv.created_at), fmtDate(inv.due_at),
          inv.total_due, INVOICE_STATUS_META[inv.status as InvoiceStatus].label, ''];
      }
      const b = r.bk;
      return [bookingLabel(b.booking_number), b.guest_name, b.email,
        fmtDate(b.scheduled_at), fmtDate(b.hold_expires_at),
        String(b.amount), b.status === 'PAID' ? 'Pagada' : 'Pendiente de pago', b.mp_payment_id];
    });
    downloadCsv(`facturas-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['N.º', 'Paciente / Invitado', 'Servicio / Método', 'Fecha cita', 'Vence', 'Monto', 'Estado', 'Ref. pago'],
      ...rows,
    ]);
  };

  const empty = invList.length === 0 && bkList.length === 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(f => {
          const on = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer',
              border: `1.5px solid ${on ? '#10b981' : 'var(--s200)'}`, background: on ? '#ecfdf5' : '#fff', color: on ? '#065f46' : 'var(--s600)',
            }}>{f.label}</button>
          );
        })}
        <button onClick={exportCsv} disabled={empty} style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
          border: '1.5px solid var(--s200)', background: '#fff', color: !empty ? 'var(--s600)' : 'var(--s300)',
          fontSize: 12.5, fontWeight: 600, cursor: !empty ? 'pointer' : 'not-allowed',
        }}><Download size={13} /> Exportar CSV</button>
        {canCreate && (
          <button onClick={() => setShowNew(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
            border: 'none', background: '#10b981', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}><Plus size={14} /> Nueva factura</button>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : empty ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--s400)' }}>
            <SearchX size={28} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 13.5, marginTop: 10 }}>No hay facturas ni reservas en este período.</div>
          </div>
        ) : (
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--s50)', textAlign: 'left', color: 'var(--s500)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                {([
                  ['number',  'N.º',                  false],
                  ['name',    'Paciente / Invitado',   false],
                  ['service', 'Servicio / Método',     false],
                  ['date',    'Fecha cita',            false],
                  ['expires', 'Vence',                 false],
                  ['amount',  'Monto',                 true ],
                  ['status',  'Estado',                false],
                ] as [SortField, string, boolean][]).map(([f, label, right]) => (
                  <th key={f} onClick={() => toggleSort(f)}
                    style={{ padding: '11px 16px', fontWeight: 700, cursor: 'pointer', userSelect: 'none',
                      textAlign: right ? 'right' : 'left',
                      color: sortField === f ? 'var(--s700)' : 'var(--s500)' }}>
                    {label}{sortIcon(f)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => {
                if (r._t === 'inv') {
                  const inv = r.inv;
                  const meta = INVOICE_STATUS_META[inv.status as InvoiceStatus];
                  return (
                    <tr key={inv.id} onClick={() => setSelected(inv)}
                      style={{ borderTop: '1px solid var(--s100)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 16px', fontFamily: "'DM Mono', monospace", color: 'var(--s600)', whiteSpace: 'nowrap' }}>{invoiceLabel(inv)}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--s800)' }}>{inv.patient_name || '—'}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--s600)' }}>{inv.service || '—'}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--s500)', whiteSpace: 'nowrap' }}>{fmtDate(inv.issued_at ?? inv.created_at)}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--s400)', whiteSpace: 'nowrap', fontSize: 12 }}>{inv.due_at ? fmtDate(inv.due_at) : '—'}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--s700)' }}>{formatMoney(inv.total_due, inv.currency)}</td>
                      <td style={{ padding: '12px 16px' }}><Badge label={meta.label} color={meta.color} bg={meta.bg} /></td>
                    </tr>
                  );
                }
                const b = r.bk;
                const paid = b.status === 'PAID';
                return (
                  <tr key={b.id} onClick={() => setSelectedBooking(b)}
                    style={{ borderTop: '1px solid var(--s100)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12.5, color: 'var(--s600)' }}>
                        {bookingLabel(b.booking_number)}
                      </span>
                      <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#e0f2fe', color: '#0369a1' }}>
                        Online
                      </span>
                      {b.invoice_number != null && (
                        <span title="Factura generada" style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#d1fae5', color: '#065f46', fontFamily: "'DM Mono', monospace" }}>
                          F-{String(b.invoice_number).padStart(6, '0')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--s800)' }}>{b.guest_name || '—'}</span>
                      {b.email && <span style={{ display: 'block', fontSize: 11, color: 'var(--s400)' }}>{b.email}</span>}
                      {b.phone && <span style={{ display: 'block', fontSize: 11, color: 'var(--s400)' }}>{b.phone}</span>}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--s600)' }}>
                      {b.payment_type ? (MP_TYPE_LABEL[b.payment_type] ?? b.payment_type) : 'Cita online'}
                      {paid && b.mp_payment_id && (
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--s400)', fontFamily: "'DM Mono', monospace" }}>
                          {MP_REF_LABEL[b.payment_type] ?? 'Ref.'} {b.mp_payment_id}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--s500)', whiteSpace: 'nowrap' }}>{fmtDate(b.scheduled_at)}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {b.hold_expires_at
                        ? <span style={{ fontSize: 12, color: paid ? 'var(--s400)' : '#b45309', fontWeight: paid ? 400 : 600 }}>{fmtDate(b.hold_expires_at)}</span>
                        : <span style={{ color: 'var(--s300)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--s700)' }}>
                      {formatMoney(String(b.amount), 'COP')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge
                        label={paid ? 'Pagada' : 'Pendiente de pago'}
                        color={paid ? '#065f46' : '#92400e'}
                        bg={paid ? '#d1fae5' : '#fef3c7'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {selected && <InvoiceDetailModal summary={selected} onClose={() => setSelected(null)} onChange={() => refetch()} />}
      {selectedBooking && (
        <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)}
          onGenerateInvoice={canCreate && selectedBooking.status === 'PAID' && !selectedBooking.invoice_id
            ? () => { setInvoicing(selectedBooking); setSelectedBooking(null); }
            : undefined} />
      )}
      {showNew && (
        <NewInvoiceModal onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); reloadAll(); }} />
      )}
      {invoicing && (
        <BookingInvoiceModal booking={invoicing} onClose={() => setInvoicing(null)}
          onCreated={inv => { setInvoicing(null); reloadAll(); setSelected(inv); }} />
      )}
    </div>
  );
}

// ── Resumen financiero tab ────────────────────────────────────────────────────
// Vertical bars: value up the Y axis, time buckets along the X axis. Buckets and
// their labels (días/semanas/meses/años) come from the backend per the period.
function IncomeChart({ data, currency }: { data: SeriesPoint[]; currency: string }) {
  const totals = data.map(d => toCents(d.online) + toCents(d.direct));
  const max = Math.max(1, ...totals);
  const money = (c: number) => formatMoney((c / 100).toFixed(2), currency);
  const H = 150;
  // Thin out X labels when there are many buckets (e.g. days of a month).
  const step = data.length > 16 ? Math.ceil(data.length / 12) : 1;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 20 ? 2 : 5, height: H }}>
        {data.map((d, i) => {
          const on = toCents(d.online), dir = toCents(d.direct), tot = on + dir;
          const h = Math.round((tot / max) * (H - 6));
          const dirH = tot > 0 ? Math.round((dir / tot) * h) : 0;
          const onH = h - dirH;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: H, minWidth: 0 }}
              title={`${d.label} — Total ${money(tot)}\nOnline ${money(on)} · Directo ${money(dir)}`}>
              <div style={{ height: onH, background: '#0ea5e9', borderRadius: '3px 3px 0 0' }} />
              <div style={{ height: dirH, background: '#10b981', borderRadius: onH === 0 ? '3px 3px 0 0' : 0 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: data.length > 20 ? 2 : 5, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--s400)', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {i % step === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function MethodBreakdown({ methods, currency }: { methods: MethodStat[]; currency: string }) {
  if (!methods || methods.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--s400)', padding: '8px 0' }}>No hay pagos en este período. Cuando entren pagos por MercadoPago (tarjeta, PSE, Efecty, Nequi…) o registres pagos directos, verás el desglose aquí.</div>;
  }
  const total = methods.reduce((a, m) => a + toCents(m.amount), 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {methods.map((m, i) => {
        const online = m.channel === 'online';
        const pct = Math.round((toCents(m.amount) / total) * 100);
        return (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: online ? '#0ea5e9' : '#10b981', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)', flex: 1 }}>{m.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: online ? '#0369a1' : '#065f46', background: online ? '#e0f2fe' : '#d1fae5', borderRadius: 6, padding: '1px 6px' }}>{online ? 'Online' : 'Directo'}</span>
              <span style={{ fontSize: 12, color: 'var(--s400)', minWidth: 54, textAlign: 'right' }}>{m.count} pago{m.count === 1 ? '' : 's'}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--s700)', minWidth: 40, textAlign: 'right' }}>{pct}%</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s700)', fontFamily: "'DM Mono', monospace", minWidth: 92, textAlign: 'right' }}>{formatMoney(m.amount, currency)}</span>
            </div>
            <div style={{ height: 5, background: 'var(--s100)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: online ? '#0ea5e9' : '#10b981', borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResumenTab({ ov }: { ov?: BillingOverview }) {
  const cur = ov?.currency ?? 'COP';
  const [confirmRemind, setConfirmRemind] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindMsg, setRemindMsg] = useState('');
  const [remindErr, setRemindErr] = useState('');

  const sendReminders = async () => {
    setReminding(true); setRemindMsg(''); setRemindErr(''); setConfirmRemind(false);
    try {
      const r = await invoicesApi.sendReminders();
      setRemindMsg(`Recordatorios enviados: ${r.sent}${r.skipped ? ` · ${r.skipped} sin correo` : ''} (de ${r.pending} pendientes).`);
    } catch (e) { setRemindErr(e instanceof Error && e.message ? e.message : 'No se pudieron enviar los recordatorios.'); }
    finally { setReminding(false); }
  };

  const exportReport = () => {
    if (!ov) return;
    downloadCsv(`informe-ingresos-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Período', 'Online', 'Directo', 'Total'],
      ...ov.series.map(s => [s.label, s.online, s.direct, (parseFloat(s.online || '0') + parseFloat(s.direct || '0')).toFixed(2)]),
    ]);
  };

  const chartLabel = PERIODS.find(p => p.id === ov?.period)?.chart ?? '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={exportReport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Download size={14} /> Exportar informe</button>
        <button onClick={() => { setConfirmRemind(true); setRemindMsg(''); setRemindErr(''); }} disabled={reminding} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: reminding ? 'var(--s200)' : '#f59e0b', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: reminding ? 'wait' : 'pointer' }}><Send size={14} /> Enviar cobros pendientes</button>
      </div>

      {confirmRemind && (
        <div style={{ padding: 14, background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 11, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#92400e', marginBottom: 10 }}>Se enviará un recordatorio de pago por correo a cada paciente con saldo pendiente. ¿Continuar?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={sendReminders} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Send size={14} /> Sí, enviar</button>
            <button onClick={() => setConfirmRemind(false)} style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
      {remindMsg && <div style={{ fontSize: 12.5, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}><CheckCircle size={14} />{remindMsg}</div>}
      {remindErr && <div style={{ fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}><AlertCircle size={14} />{remindErr}</div>}

      {ov && (
        <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s700)' }}>Ingresos — {chartLabel}</span>
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--s500)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#0ea5e9' }} /> Online</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981' }} /> Directo</span>
            </div>
          </div>
          <IncomeChart data={ov.series} currency={cur} />
        </div>
      )}

      {ov && (
        <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s700)', marginBottom: 14 }}>Medios de pago</div>
          <MethodBreakdown methods={ov.methods} currency={cur} />
        </div>
      )}
    </div>
  );
}

// ── Balance por paciente tab ──────────────────────────────────────────────────
function PacientesTab({ period }: { period: BillingPeriod }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['patients-balance', period],
    queryFn: () => invoicesApi.patientsBalance(period),
  });
  const list = data ?? [];

  return (
    <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, overflow: 'hidden' }}>
      {isLoading ? (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : list.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--s400)' }}>
          <SearchX size={28} style={{ opacity: 0.5 }} />
          <div style={{ fontSize: 13.5, marginTop: 10 }}>No hay actividad de pacientes en este período.</div>
        </div>
      ) : (
        <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--s50)', textAlign: 'left', color: 'var(--s500)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>
              <th style={{ padding: '11px 16px', fontWeight: 700 }}>Paciente</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'center' }}>Sesiones</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Facturado</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Cobrado</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Pendiente</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, width: 140 }}>% pagado</th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr key={p.patient_id} onClick={() => navigate(`/patients/${p.patient_id}`)}
                style={{ borderTop: '1px solid var(--s100)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--s800)' }}>{p.name || '—'}</td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--s600)' }}>{p.sessions}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--s700)' }}>{formatMoney(p.invoiced, 'COP')}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#065f46' }}>{formatMoney(p.collected, 'COP')}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: Number(p.pending) > 0 ? '#b45309' : 'var(--s400)' }}>{formatMoney(p.pending, 'COP')}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--s100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${p.paid_pct}%`, height: '100%', background: p.paid_pct >= 100 ? '#10b981' : p.paid_pct > 0 ? '#f59e0b' : 'var(--s200)', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--s600)', minWidth: 32, textAlign: 'right' }}>{p.paid_pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// ── Equipo tab (owner dashboard: per-professional metrics) ────────────────────

// periodWindow mirrors the backend's periodRange: [from, now] in local time
// (Colombia has no DST, so local ≈ COT for our users). Null for 'all'.
function periodWindow(period: BillingPeriod): { from: Date; to: Date } | null {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'week': {
      const mo = (day.getDay() + 6) % 7; // Monday = 0
      const from = new Date(day);
      from.setDate(day.getDate() - mo);
      return { from, to: now };
    }
    case 'month':   return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'quarter': return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: now };
    case 'year':    return { from: new Date(now.getFullYear(), 0, 1), to: now };
    default:        return null;
  }
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

function dailyWorkMinutes(cfg: ScheduleConfig): number {
  let v = toMin(cfg.endHour) - toMin(cfg.startHour);
  if (cfg.breakStart && cfg.breakEnd) v -= Math.max(0, toMin(cfg.breakEnd) - toMin(cfg.breakStart));
  return Math.max(v, 0);
}

// availableMinutes sums the professional's configured working minutes over the
// elapsed days of the window — the denominator of the occupancy ratio.
function availableMinutes(cfg: ScheduleConfig, from: Date, to: Date): number {
  const perDay = dailyWorkMinutes(cfg);
  let total = 0;
  const d = new Date(from);
  let guard = 0;
  while (d <= to && guard < 400) {
    guard++;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (isWorkingDay(iso, cfg)) total += perDay;
    d.setDate(d.getDate() + 1);
  }
  return total;
}

const fmtHours = (min: number) => min >= 60
  ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`
  : `${min}m`;

function EquipoTab({ period }: { period: BillingPeriod }) {
  const { data, isLoading } = useQuery({
    queryKey: ['team-stats', period],
    queryFn: () => invoicesApi.teamStats(period),
  });
  // Working-hours config per professional, for the occupancy denominator.
  const { data: profs } = useQuery({
    queryKey: ['org-professionals'],
    queryFn: () => authApi.listProfessionals(),
  });
  const list = data ?? [];
  const win = periodWindow(period);

  const schedules: Record<string, ScheduleConfig> = {};
  for (const p of profs?.items ?? []) {
    schedules[p.id] = { ...DEFAULT_SCHEDULE, ...(p.working_hours as Partial<ScheduleConfig>) };
  }

  const occupancy = (m: TeamMemberStats): number | null => {
    if (!win || !m.staff_id || !schedules[m.staff_id]) return null;
    const avail = availableMinutes(schedules[m.staff_id], win.from, win.to);
    if (avail <= 0) return null;
    return Math.min(100, Math.round((m.booked_minutes / avail) * 100));
  };

  const cancelRate = (m: TeamMemberStats): number | null => {
    const base = m.scheduled + m.cancelled + m.rescheduled;
    if (base === 0) return null;
    return Math.round((m.cancelled / base) * 100);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, overflow: 'hidden' }}>
      {isLoading ? (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : list.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--s400)' }}>
          <SearchX size={28} style={{ opacity: 0.5 }} />
          <div style={{ fontSize: 13.5, marginTop: 10 }}>No hay actividad del equipo en este período.</div>
        </div>
      ) : (
        <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--s50)', textAlign: 'left', color: 'var(--s500)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>
              <th style={{ padding: '11px 16px', fontWeight: 700 }}>Profesional</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'center' }} title="Sesiones realizadas / agendadas en el período">Sesiones</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'center' }}>No asistió</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'center' }} title="Cancelaciones (excluye reagendas) y su tasa sobre lo agendado">Canceladas</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'center' }}>Reagendas</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Horas</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, width: 140 }} title="Horas agendadas sobre el horario configurado del profesional en los días transcurridos del período">Ocupación</th>
              <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {list.map(m => {
              const occ = occupancy(m);
              const cr = cancelRate(m);
              const unassigned = !m.staff_id;
              return (
                <tr key={m.staff_id || 'unassigned'} style={{ borderTop: '1px solid var(--s100)', opacity: unassigned ? 0.75 : 1 }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--s800)', fontStyle: unassigned ? 'italic' : 'normal' }}>{m.name}</span>
                      {m.role_name === 'INTERN' && <Badge label="Practicante" color="#7c3aed" bg="#f3e8ff" />}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--s700)' }}>
                    <b>{m.completed}</b><span style={{ color: 'var(--s400)' }}> / {m.scheduled}</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: m.no_show > 0 ? 700 : 400, color: m.no_show > 0 ? '#b45309' : 'var(--s400)' }}>{m.no_show}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--s600)' }}>
                    {m.cancelled}{cr !== null && m.cancelled > 0 && <span style={{ fontSize: 11.5, color: cr >= 25 ? '#dc2626' : 'var(--s400)' }}> ({cr}%)</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--s600)' }}>{m.rescheduled}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--s700)' }}>{fmtHours(m.booked_minutes)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {occ === null ? (
                      <span style={{ color: 'var(--s300)' }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--s100)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${occ}%`, height: '100%', background: occ >= 70 ? '#10b981' : occ >= 35 ? '#f59e0b' : 'var(--s300)', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--s600)', minWidth: 32, textAlign: 'right' }}>{occ}%</span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#065f46' }}>{formatMoney(m.collected, 'COP')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--s100)', fontSize: 11.5, color: 'var(--s400)', lineHeight: 1.5 }}>
        <b>Ingresos</b> = pagos de facturas atribuidos por la cita del profesional + reservas online pagadas sin factura. <b>Ocupación</b> = horas agendadas sobre el horario configurado en los días transcurridos del período.
      </div>
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────
type Tab = 'facturas' | 'resumen' | 'pacientes' | 'equipo';

export function BillingPage() {
  const [tab, setTab] = useState<Tab>('facturas');
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Org-wide financial reports (overview KPIs, per-patient balance, team stats)
  // need billing:reports — a CLINIC_ADMIN/owner permission. A plain professional
  // only sees the Facturas tab, scoped by the API to their own patients.
  const canSeeReports = (user?.permissions ?? []).includes('billing:reports');

  const { data: ov } = useQuery<BillingOverview>({
    queryKey: ['billing-overview', period],
    queryFn: () => invoicesApi.overview(period),
    enabled: canSeeReports,
  });

  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'facturas',  label: 'Facturas', Icon: FileText },
    ...(canSeeReports ? [
      { id: 'resumen'   as Tab, label: 'Resumen financiero', Icon: BarChart3 },
      { id: 'pacientes' as Tab, label: 'Balance por paciente', Icon: Users },
      { id: 'equipo'    as Tab, label: 'Equipo', Icon: Stethoscope },
    ] : []),
  ];

  return (
    <div style={{ padding: isMobile ? '14px 12px' : '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Receipt size={20} color="#10b981" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>Facturación</h1>
        {/* Module-level period selector — drives the cards and every tab */}
        <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', gap: 4, background: 'var(--s100)', borderRadius: 9, padding: 3, overflowX: 'auto', flexShrink: 0 }}>
          {PERIODS.map(p => {
            const on = period === p.id;
            return (
              <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5,
                fontWeight: on ? 700 : 500, background: on ? '#fff' : 'transparent', color: on ? 'var(--s800)' : 'var(--s500)',
                boxShadow: on ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}>{p.label}</button>
            );
          })}
        </div>
      </div>

      {canSeeReports && <KpiCards ov={ov} period={period} />}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--s200)', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: on ? 700 : 500, color: on ? 'var(--teal-d)' : 'var(--s500)',
              borderBottom: `2px solid ${on ? 'var(--teal)' : 'transparent'}`, marginBottom: -1,
            }}>
              <t.Icon size={15} color={on ? 'var(--teal)' : 'var(--s400)'} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'facturas'  && <FacturasTab period={period} />}
      {canSeeReports && tab === 'resumen'   && <ResumenTab ov={ov} />}
      {canSeeReports && tab === 'pacientes' && <PacientesTab period={period} />}
      {canSeeReports && tab === 'equipo'    && <EquipoTab period={period} />}

      <p style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 16, lineHeight: 1.5 }}>
        Facturación interna del consultorio (comprobantes de pago). <b>Online</b> = pagos por MercadoPago; <b>Directo</b> = pagos registrados a mano. No constituye facturación electrónica DIAN.
      </p>
    </div>
  );
}
