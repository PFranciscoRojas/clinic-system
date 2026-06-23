import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Wallet, Clock, SearchX, ArrowUp, ArrowDown, Globe, HandCoins, FileText, BarChart3, AlertTriangle, Download, Send, CheckCircle, AlertCircle, Users, CalendarCheck } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { InvoiceDetailModal } from '@/components/billing/InvoiceDetailModal';
import {
  invoicesApi, formatMoney, balanceOf, invoiceLabel,
  INVOICE_STATUS_META, type Invoice, type InvoiceStatus,
  type BillingOverview, type BillingPeriod, type SeriesPoint, type MethodStat,
} from '@/api/invoices';

const FILTERS: { id: string; label: string }[] = [
  { id: '',          label: 'Todas'        },
  { id: 'ISSUED',    label: 'Emitidas'     },
  { id: 'PARTIAL',   label: 'Pago parcial' },
  { id: 'PAID',      label: 'Pagadas'      },
  { id: 'DRAFT',     label: 'Borradores'   },
  { id: 'CANCELLED', label: 'Anuladas'     },
];

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

// ── Facturas tab ──────────────────────────────────────────────────────────────
function FacturasTab({ period }: { period: BillingPeriod }) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const { data: invoices, isLoading, refetch } = useQuery({
    queryKey: ['invoices-all', filter, period],
    queryFn: () => invoicesApi.listAll(filter || undefined, period),
  });
  const list = invoices ?? [];

  const exportCsv = () => {
    downloadCsv(`facturas-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['N.º', 'Paciente', 'Servicio', 'Fecha', 'Total', 'Pagado', 'Saldo', 'Estado'],
      ...list.map(inv => [
        invoiceLabel(inv), inv.patient_name || '', inv.service || '',
        fmtDate(inv.issued_at ?? inv.created_at), inv.total_due, inv.total_paid,
        balanceOf(inv), INVOICE_STATUS_META[inv.status as InvoiceStatus].label,
      ]),
    ]);
  };

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
        <button onClick={exportCsv} disabled={list.length === 0} style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
          border: '1.5px solid var(--s200)', background: '#fff', color: list.length ? 'var(--s600)' : 'var(--s300)',
          fontSize: 12.5, fontWeight: 600, cursor: list.length ? 'pointer' : 'not-allowed',
        }}><Download size={13} /> Exportar CSV</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : list.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--s400)' }}>
            <SearchX size={28} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 13.5, marginTop: 10 }}>No hay facturas en este período/estado.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--s50)', textAlign: 'left', color: 'var(--s500)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>N.º</th>
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>Paciente</th>
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>Servicio</th>
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>Fecha</th>
                <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Monto</th>
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv: Invoice) => {
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
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--s700)' }}>{formatMoney(inv.total_due, inv.currency)}</td>
                    <td style={{ padding: '12px 16px' }}><Badge label={meta.label} color={meta.color} bg={meta.bg} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && <InvoiceDetailModal summary={selected} onClose={() => setSelected(null)} onChange={() => refetch()} />}
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
      )}
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────
// ── Reservas online tab ───────────────────────────────────────────────────────
const BOOKING_STATUS_LABEL: Record<string, string> = {
  PAID: 'Pagada', PENDING_PAYMENT: 'Pendiente de pago',
};
const BOOKING_STATUS_COLOR: Record<string, string> = {
  PAID: '#059669', PENDING_PAYMENT: '#d97706',
};
const MODALITY_LABEL: Record<string, string> = { IN_PERSON: 'Presencial', VIRTUAL: 'Virtual', HYBRID: 'Híbrida' };
const MP_TYPE_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta crédito', debit_card: 'Tarjeta débito',
  bank_transfer: 'PSE', ticket: 'Efecty', atm: 'ATM', account_money: 'Cuenta MP',
};

function ReservasTab({ period }: { period: BillingPeriod }) {
  const [filter, setFilter] = useState<'' | 'PAID' | 'PENDING_PAYMENT'>('');

  const { data, isLoading } = useQuery({
    queryKey: ['bookings-revenue', filter, period],
    queryFn: () => invoicesApi.listBookings(filter || undefined, period),
  });
  const list = data ?? [];

  const fmtDT = (s: string) => new Date(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtD  = (s: string) => new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  const totalPaid = list.filter(b => b.status === 'PAID').reduce((s, b) => s + b.amount, 0);

  const BOOKING_FILTERS = [
    { id: '' as const, label: 'Todas' },
    { id: 'PAID' as const, label: 'Pagadas' },
    { id: 'PENDING_PAYMENT' as const, label: 'Pendientes' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {BOOKING_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5,
              fontWeight: filter === f.id ? 700 : 500,
              background: filter === f.id ? 'var(--teal)' : 'var(--s100)',
              color: filter === f.id ? '#fff' : 'var(--s600)',
            }}>{f.label}</button>
          ))}
        </div>
        {totalPaid > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#059669' }}>
            Total cobrado: {formatMoney(String(totalPaid), 'COP')}
          </span>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner size={24} /></div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--s400)' }}>
          <SearchX size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: 13 }}>Sin reservas en este período.</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--s200)' }}>
              {['Cita', 'Paciente / invitado', 'Modalidad', 'Método', 'Monto', 'Estado', 'Vence / pagó'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--s500)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid var(--s100)' }}>
                <td style={{ padding: '10px 10px' }}>{fmtDT(b.scheduled_at)}</td>
                <td style={{ padding: '10px 10px' }}>
                  <span style={{ fontWeight: 600 }}>{b.guest_name || '—'}</span>
                  {b.email && <span style={{ display: 'block', fontSize: 11, color: 'var(--s400)' }}>{b.email}</span>}
                </td>
                <td style={{ padding: '10px 10px', color: 'var(--s500)' }}>{MODALITY_LABEL[b.modality] ?? (b.modality || '—')}</td>
                <td style={{ padding: '10px 10px', color: 'var(--s600)' }}>
                  {b.payment_type ? (MP_TYPE_LABEL[b.payment_type] ?? b.payment_type) : '—'}
                  {b.voucher_url && b.status === 'PENDING_PAYMENT' && (
                    <a href={b.voucher_url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 11, color: '#0ea5e9' }}>Ver comprobante</a>
                  )}
                </td>
                <td style={{ padding: '10px 10px', fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                  {formatMoney(String(b.amount), 'COP')}
                </td>
                <td style={{ padding: '10px 10px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                    background: BOOKING_STATUS_COLOR[b.status] + '18',
                    color: BOOKING_STATUS_COLOR[b.status] }}>
                    {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </td>
                <td style={{ padding: '10px 10px', fontSize: 12, color: 'var(--s500)' }}>
                  {b.paid_at ? fmtD(b.paid_at) : b.hold_expires_at ? `vence ${fmtD(b.hold_expires_at)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type Tab = 'facturas' | 'resumen' | 'pacientes' | 'reservas';

export function BillingPage() {
  const [tab, setTab] = useState<Tab>('reservas');
  const [period, setPeriod] = useState<BillingPeriod>('month');

  const { data: ov } = useQuery<BillingOverview>({ queryKey: ['billing-overview', period], queryFn: () => invoicesApi.overview(period) });

  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'reservas',  label: 'Reservas online', Icon: CalendarCheck },
    { id: 'facturas',  label: 'Facturas', Icon: FileText },
    { id: 'resumen',   label: 'Resumen financiero', Icon: BarChart3 },
    { id: 'pacientes', label: 'Balance por paciente', Icon: Users },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Receipt size={20} color="#10b981" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>Facturación</h1>
        {/* Module-level period selector — drives the cards and every tab */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: 'var(--s100)', borderRadius: 9, padding: 3 }}>
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

      <KpiCards ov={ov} period={period} />

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--s200)' }}>
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

      {tab === 'reservas'  && <ReservasTab period={period} />}
      {tab === 'facturas'  && <FacturasTab period={period} />}
      {tab === 'resumen'   && <ResumenTab ov={ov} />}
      {tab === 'pacientes' && <PacientesTab period={period} />}

      <p style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 16, lineHeight: 1.5 }}>
        Facturación interna del consultorio (comprobantes de pago). <b>Online</b> = pagos por MercadoPago; <b>Directo</b> = pagos registrados a mano. No constituye facturación electrónica DIAN.
      </p>
    </div>
  );
}
