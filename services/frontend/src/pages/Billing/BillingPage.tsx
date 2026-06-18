import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Wallet, Clock, SearchX, ArrowUp, ArrowDown, Globe, HandCoins, FileText, BarChart3, AlertTriangle, Download, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { InvoiceDetailModal } from '@/components/billing/InvoiceDetailModal';
import {
  invoicesApi, formatMoney, balanceOf, invoiceLabel,
  INVOICE_STATUS_META, type Invoice, type InvoiceStatus,
  type BillingOverview, type BillingPeriod, type MonthBucket, type MethodStat,
} from '@/api/invoices';

const PERIODS: { id: BillingPeriod; label: string; noun: string }[] = [
  { id: 'week',  label: 'Semana', noun: 'de la semana' },
  { id: 'month', label: 'Mes',    noun: 'del mes'      },
  { id: 'year',  label: 'Año',    noun: 'del año'      },
  { id: 'all',   label: 'Todo',   noun: 'totales'      },
];

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const FILTERS: { id: string; label: string }[] = [
  { id: '',          label: 'Todas'        },
  { id: 'ISSUED',    label: 'Emitidas'     },
  { id: 'PARTIAL',   label: 'Pago parcial' },
  { id: 'PAID',      label: 'Pagadas'      },
  { id: 'DRAFT',     label: 'Borradores'   },
  { id: 'CANCELLED', label: 'Anuladas'     },
];

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthShort = (m: string) => MES[parseInt(m.slice(5, 7), 10) - 1] ?? m;
const toCents = (s: string) => Math.round(parseFloat(s || '0') * 100);
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function deltaPct(cur: string, prev: string): number | null {
  const c = parseFloat(cur || '0'), p = parseFloat(prev || '0');
  if (p <= 0) return null;
  return Math.round(((c - p) / p) * 100);
}

// ── Facturas tab ──────────────────────────────────────────────────────────────
function FacturasTab() {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const { data: invoices, isLoading, refetch } = useQuery({
    queryKey: ['invoices-all', filter],
    queryFn: () => invoicesApi.listAll(filter || undefined),
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
            <div style={{ fontSize: 13.5, marginTop: 10 }}>No hay facturas{filter ? ' con este estado' : ' todavía'}.</div>
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

      {selected && (
        <InvoiceDetailModal summary={selected} onClose={() => setSelected(null)} onChange={() => refetch()} />
      )}
    </div>
  );
}

// ── Resumen financiero tab ────────────────────────────────────────────────────
function MonthlyChart({ data, currency }: { data: MonthBucket[]; currency: string }) {
  const totals = data.map(d => toCents(d.online) + toCents(d.direct));
  const max = Math.max(1, ...totals);
  const H = 130;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: H }}>
        {data.map(d => {
          const on = toCents(d.online), dir = toCents(d.direct), tot = on + dir;
          const h = Math.round((tot / max) * H);
          const onH = tot > 0 ? Math.round((on / tot) * h) : 0;
          const dirH = h - onH;
          const money = (c: number) => formatMoney((c / 100).toFixed(2), currency);
          return (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: H }}
              title={`${monthShort(d.month)} ${d.month.slice(0, 4)} — Total ${money(tot)}\nOnline ${money(on)} · Directo ${money(dir)}`}>
              <div style={{ height: onH, background: '#0ea5e9', borderRadius: '4px 4px 0 0' }} />
              <div style={{ height: dirH, background: '#10b981', borderRadius: onH === 0 ? '4px 4px 0 0' : 0 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {data.map(d => <div key={d.month} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: 'var(--s400)' }}>{monthShort(d.month)}</div>)}
      </div>
    </div>
  );
}

function MethodBreakdown({ methods, currency }: { methods: MethodStat[]; currency: string }) {
  if (!methods || methods.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--s400)', padding: '8px 0' }}>Aún no hay pagos registrados. Cuando entren pagos por MercadoPago (tarjeta, PSE, Efecty, Nequi…) o registres pagos directos, verás el desglose aquí.</div>;
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

function ResumenTab() {
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const { data: ov } = useQuery<BillingOverview>({ queryKey: ['billing-overview', period], queryFn: () => invoicesApi.overview(period) });
  const cur = ov?.currency ?? 'COP';
  const noun = PERIODS.find(p => p.id === period)?.noun ?? '';
  const delta = ov?.has_delta ? deltaPct(ov.income, ov.income_prev) : null;
  const up = (delta ?? 0) >= 0;

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
    downloadCsv(`informe-ingresos-${new Date().toISOString().slice(0, 7)}.csv`, [
      ['Mes', 'Online', 'Directo', 'Total'],
      ...ov.monthly.map(m => [m.month, m.online, m.direct, (parseFloat(m.online || '0') + parseFloat(m.direct || '0')).toFixed(2)]),
    ]);
  };

  return (
    <div>
      {/* Period selector + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--s100)', borderRadius: 9, padding: 3 }}>
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={exportReport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Download size={14} /> Exportar informe</button>
          <button onClick={() => { setConfirmRemind(true); setRemindMsg(''); setRemindErr(''); }} disabled={reminding} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: reminding ? 'var(--s200)' : '#f59e0b', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: reminding ? 'wait' : 'pointer' }}><Send size={14} /> Enviar cobros pendientes</button>
        </div>
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

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
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

      {ov && (
        <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s700)' }}>Ingresos últimos 12 meses</span>
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--s500)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#0ea5e9' }} /> Online</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981' }} /> Directo</span>
            </div>
          </div>
          <MonthlyChart data={ov.monthly} currency={cur} />
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

// ── Page shell with tabs ──────────────────────────────────────────────────────
type Tab = 'facturas' | 'resumen';

export function BillingPage() {
  const [tab, setTab] = useState<Tab>('facturas');
  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'facturas', label: 'Facturas', Icon: FileText },
    { id: 'resumen',  label: 'Resumen financiero', Icon: BarChart3 },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Receipt size={20} color="#10b981" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>Facturación</h1>
      </div>

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

      {tab === 'facturas' ? <FacturasTab /> : <ResumenTab />}

      <p style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 16, lineHeight: 1.5 }}>
        Facturación interna del consultorio (comprobantes de pago). <b>Online</b> = pagos por MercadoPago; <b>Directo</b> = pagos registrados a mano. No constituye facturación electrónica DIAN.
      </p>
    </div>
  );
}
