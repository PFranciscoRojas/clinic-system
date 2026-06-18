import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Receipt, TrendingUp, Wallet, Clock, ChevronRight, SearchX } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import {
  invoicesApi, formatMoney, balanceOf,
  INVOICE_STATUS_META, type Invoice, type InvoiceStatus,
} from '@/api/invoices';

const FILTERS: { id: string; label: string }[] = [
  { id: '',        label: 'Todas'        },
  { id: 'ISSUED',  label: 'Emitidas'     },
  { id: 'PARTIAL', label: 'Pago parcial' },
  { id: 'PAID',    label: 'Pagadas'      },
  { id: 'DRAFT',   label: 'Borradores'   },
  { id: 'CANCELLED', label: 'Anuladas'   },
];

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function KpiCard({ Icon, label, value, sub, color }: {
  Icon: React.ElementType; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 200, background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--s500)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 3 }}>{sub}</div>
    </div>
  );
}

export function BillingPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  const { data: summary } = useQuery({ queryKey: ['invoice-summary'], queryFn: () => invoicesApi.summary() });
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices-all', filter],
    queryFn: () => invoicesApi.listAll(filter || undefined),
  });

  const cur = summary?.currency ?? 'COP';
  const list = invoices ?? [];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Receipt size={20} color="#10b981" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>Facturación</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--s500)', margin: '0 0 20px' }}>
        Ingresos del consultorio a partir de las facturas reales. Las facturas y pagos se gestionan desde cada paciente.
      </p>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <KpiCard Icon={TrendingUp} color="#0ea5e9" label="Total facturado"
          value={formatMoney(summary?.invoiced ?? '0', cur)}
          sub={`${summary?.count ?? 0} factura${(summary?.count ?? 0) === 1 ? '' : 's'} (sin anuladas)`} />
        <KpiCard Icon={Wallet} color="#10b981" label="Total cobrado"
          value={formatMoney(summary?.collected ?? '0', cur)}
          sub={`${summary?.paid ?? 0} pagada${(summary?.paid ?? 0) === 1 ? '' : 's'} · ${summary?.partial ?? 0} parcial${(summary?.partial ?? 0) === 1 ? '' : 'es'}`} />
        <KpiCard Icon={Clock} color="#f59e0b" label="Saldo pendiente"
          value={formatMoney(summary?.pending ?? '0', cur)}
          sub={`${(summary?.issued ?? 0) + (summary?.partial ?? 0)} factura(s) por cobrar`} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(f => {
          const on = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer',
              border: `1.5px solid ${on ? '#10b981' : 'var(--s200)'}`,
              background: on ? '#ecfdf5' : '#fff', color: on ? '#065f46' : 'var(--s600)',
            }}>{f.label}</button>
          );
        })}
      </div>

      {/* Table */}
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
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>Fecha</th>
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>Paciente</th>
                <th style={{ padding: '11px 16px', fontWeight: 700 }}>Estado</th>
                <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Total</th>
                <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Pagado</th>
                <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Saldo</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv: Invoice) => {
                const meta = INVOICE_STATUS_META[inv.status as InvoiceStatus];
                const bal = balanceOf(inv);
                return (
                  <tr key={inv.id} onClick={() => navigate(`/patients/${inv.patient_id}`)}
                    style={{ borderTop: '1px solid var(--s100)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', color: 'var(--s500)', whiteSpace: 'nowrap' }}>{fmtDate(inv.issued_at ?? inv.created_at)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--s800)' }}>{inv.patient_name || '—'}</td>
                    <td style={{ padding: '12px 16px' }}><Badge label={meta.label} color={meta.color} bg={meta.bg} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--s700)' }}>{formatMoney(inv.total_due, inv.currency)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#065f46' }}>{formatMoney(inv.total_paid, inv.currency)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: Number(bal) > 0 ? '#b45309' : 'var(--s400)' }}>{formatMoney(bal, inv.currency)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}><ChevronRight size={15} color="var(--s300)" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 14, lineHeight: 1.5 }}>
        Facturación interna del consultorio (comprobantes de pago). No constituye facturación electrónica DIAN.
      </p>
    </div>
  );
}
