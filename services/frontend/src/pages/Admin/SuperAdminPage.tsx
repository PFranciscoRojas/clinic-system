import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, CheckCircle2, Activity, HardDrive, Database,
  Cpu, Users, Bot, RefreshCw,
} from 'lucide-react';
import { adminApi, type AdminOrg, type SystemHealth } from '@/api/admin';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function fmtUptime(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

function diskColor(pct: number) {
  if (pct >= 85) return '#dc2626';
  if (pct >= 70) return '#d97706';
  return '#16a34a';
}

// ── sub-components ────────────────────────────────────────────────────────────

function MetricCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--s700)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--s100)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--s500)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent ?? 'var(--s800)' }}>{value}</span>
    </div>
  );
}

function DiskBar({ pct }: { pct: number }) {
  const color = diskColor(pct);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--s500)' }}>Uso del disco</span>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div style={{ background: 'var(--s100)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

function Badge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--s50)', borderRadius: 10, padding: '10px 16px', minWidth: 72 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color }}>{count}</span>
      <span style={{ fontSize: 11, color: 'var(--s500)', marginTop: 2 }}>{label}</span>
    </div>
  );
}

// ── Sistema tab ───────────────────────────────────────────────────────────────

function SistemaTab() {
  const { data: h, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<SystemHealth>({
    queryKey: ['admin-system-health'],
    queryFn: adminApi.systemHealth,
    refetchInterval: 30_000,
  });

  const ago = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 1000) : null;

  if (isLoading) return <div style={{ fontSize: 14, color: 'var(--s400)', padding: '24px 0' }}>Cargando métricas…</div>;
  if (!h) return null;

  const aiAlert = h.ai_queue.error > 0 || h.ai_queue.processing > 5;

  return (
    <div>
      {/* header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 12.5, color: 'var(--s400)' }}>
          Uptime: <strong>{fmtUptime(h.uptime_sec)}</strong>
          {ago !== null && <span style={{ marginLeft: 12 }}>Actualizado hace {ago}s</span>}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--s200)', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--s600)' }}
        >
          <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          Actualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

        {/* Disco */}
        <MetricCard icon={<HardDrive size={16} />} title="Disco">
          <DiskBar pct={h.disk.used_pct} />
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Usado" value={`${h.disk.used_gb} GB`} accent={diskColor(h.disk.used_pct)} />
            <StatRow label="Libre" value={`${h.disk.free_gb} GB`} />
            <StatRow label="Total" value={`${h.disk.total_gb} GB`} />
          </div>
        </MetricCard>

        {/* Base de datos */}
        <MetricCard icon={<Database size={16} />} title="Base de datos">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Tamaño" value={`${h.db.size_mb} MB`} />
            <StatRow label="Conexiones activas" value={h.db.active_conns} />
            <StatRow label="Conexiones inactivas" value={h.db.idle_conns} />
            <StatRow label="Total pool" value={h.db.total_conns} />
          </div>
          {h.db.top_tables.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--s500)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Top tablas</div>
              {h.db.top_tables.map(t => (
                <StatRow key={t.name} label={t.name} value={`${t.size_mb} MB`} />
              ))}
            </div>
          )}
        </MetricCard>

        {/* Redis */}
        <MetricCard icon={<Cpu size={16} />} title="Redis">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Estado" value={h.redis.ok ? '● Online' : '● Offline'} accent={h.redis.ok ? '#16a34a' : '#dc2626'} />
            <StatRow label="Latencia" value={`${h.redis.ping_ms} ms`} />
            <StatRow label="Memoria usada" value={h.redis.used_memory_human || '—'} />
          </div>
        </MetricCard>

        {/* Tenants */}
        <MetricCard icon={<Users size={16} />} title="Tenants">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Badge label="activos" count={h.tenants.active} color="#16a34a" />
            <Badge label="trial" count={h.tenants.trialing} color="#0f766e" />
            <Badge label="vencidos" count={h.tenants.past_due} color="#d97706" />
            <Badge label="cancelados" count={h.tenants.canceled} color="#6b7280" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Total usuarios" value={h.tenants.total_users} />
            <StatRow label="Total pacientes" value={h.tenants.total_patients} />
          </div>
        </MetricCard>

        {/* IA Queue */}
        <MetricCard icon={<Bot size={16} />} title={`Cola IA${aiAlert ? ' ⚠️' : ''}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Pendientes" value={h.ai_queue.pending} />
            <StatRow label="Procesando" value={h.ai_queue.processing} accent={h.ai_queue.processing > 5 ? '#d97706' : undefined} />
            <StatRow label="Listos" value={h.ai_queue.draft_ready} accent="#16a34a" />
            <StatRow
              label="Errores"
              value={h.ai_queue.error}
              accent={h.ai_queue.error > 0 ? '#dc2626' : undefined}
            />
          </div>
        </MetricCard>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Tenants tab ───────────────────────────────────────────────────────────────

function TenantsTab() {
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

  const statusColor: Record<string, string> = { active: '#16a34a', trialing: '#0f766e', past_due: '#b45309', canceled: '#dc2626' };

  return (
    <>
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
                    <td style={{ padding: '12px 16px', color: 'var(--s600)' }}>{fmtDate(until)}</td>
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
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'tenants' | 'sistema';

export function SuperAdminPage() {
  const [tab, setTab] = useState<Tab>('tenants');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'tenants', label: 'Tenants', icon: <Building2 size={14} /> },
    { id: 'sistema', label: 'Sistema', icon: <Activity size={14} /> },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Building2 size={22} color="var(--teal)" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>Operador SaaS</h1>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--s500)', marginBottom: 22 }}>
        Consola de administración global — tenants y monitoreo del sistema.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: '2px solid var(--s100)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', border: 'none', background: 'none',
              fontSize: 13.5, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--teal)' : 'var(--s500)',
              borderBottom: tab === t.id ? '2px solid var(--teal)' : '2px solid transparent',
              marginBottom: -2, cursor: 'pointer', borderRadius: '6px 6px 0 0',
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'tenants' && <TenantsTab />}
      {tab === 'sistema' && <SistemaTab />}
    </div>
  );
}
