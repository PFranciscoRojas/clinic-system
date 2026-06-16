import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2 } from 'lucide-react';
import { adminApi, type AdminOrg } from '@/api/admin';

// Operator (SYSTEM_ADMIN) console: see every tenant and activate the ones that
// paid out-of-band (cash, Nequi, transfer) for N months.
export function SuperAdminPage() {
  const qc = useQueryClient();
  const { data: orgs, isLoading } = useQuery({ queryKey: ['admin-orgs'], queryFn: adminApi.listOrgs });
  const [busyId, setBusyId] = useState<string | null>(null);

  const activate = useMutation({
    mutationFn: ({ id, months }: { id: string; months: number }) => adminApi.activateOrg(id, months),
    onSettled: () => { setBusyId(null); qc.invalidateQueries({ queryKey: ['admin-orgs'] }); },
  });

  const handleActivate = (o: AdminOrg) => {
    const input = window.prompt(`Activar "${o.name}" — ¿cuántos meses?`, '1');
    if (!input) return;
    const months = parseInt(input, 10);
    if (!Number.isInteger(months) || months < 1 || months > 36) { alert('Ingresa un número de meses entre 1 y 36.'); return; }
    setBusyId(o.id);
    activate.mutate({ id: o.id, months });
  };

  const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const statusColor: Record<string, string> = { active: '#16a34a', trialing: '#0f766e', past_due: '#b45309', canceled: '#dc2626' };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Building2 size={22} color="var(--teal)" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>Operador SaaS</h1>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--s500)', marginBottom: 22 }}>
        Organizaciones registradas. Activa manualmente a quien pague por transferencia, Nequi o efectivo.
      </p>

      {isLoading ? (
        <div style={{ fontSize: 14, color: 'var(--s400)' }}>Cargando…</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: 'var(--s50)', color: 'var(--s500)', textAlign: 'left' }}>
                <th style={{ padding: '11px 16px', fontWeight: 600 }}>Consultorio</th>
                <th style={{ padding: '11px 16px', fontWeight: 600 }}>Estado</th>
                <th style={{ padding: '11px 16px', fontWeight: 600 }}>Acceso hasta</th>
                <th style={{ padding: '11px 16px', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {(orgs ?? []).map(o => {
                const until = o.current_period_end ?? o.trial_ends_at;
                return (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--s100)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--s800)' }}>{o.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>{o.slug}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontWeight: 600, color: statusColor[o.subscription_status] ?? 'var(--s600)' }}>{o.subscription_status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--s600)' }}>{fmt(until)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button onClick={() => handleActivate(o)} disabled={busyId === o.id} style={{
                        border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12.5, fontWeight: 700,
                        borderRadius: 9, padding: '7px 14px', cursor: busyId === o.id ? 'wait' : 'pointer',
                      }}>
                        {busyId === o.id ? 'Activando…' : 'Activar meses'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(orgs ?? []).length === 0 && (
                <tr><td colSpan={4} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--s400)' }}>Aún no hay organizaciones.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activate.isSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, color: '#16a34a' }}>
          <CheckCircle2 size={15} /> Activación aplicada.
        </div>
      )}
    </div>
  );
}
