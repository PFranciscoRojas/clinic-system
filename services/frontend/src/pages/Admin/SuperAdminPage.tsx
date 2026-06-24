import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, CheckCircle2, Activity, HardDrive, Database,
  Cpu, Users, Bot, RefreshCw, AlertTriangle, Info,
  AlertCircle, Wrench, MemoryStick,
} from 'lucide-react';
import { adminApi, type AdminOrg, type SystemHealth, type ActionResult } from '@/api/admin';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function fmtUptime(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

function pctColor(pct: number) {
  if (pct >= 85) return '#dc2626';
  if (pct >= 70) return '#d97706';
  return '#16a34a';
}

const REFRESH_SEC = 10;

// ── Tooltip wrapper ───────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <Info
        size={13}
        color="var(--s400)"
        style={{ cursor: 'pointer', flexShrink: 0 }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', fontSize: 11.5, lineHeight: 1.5,
          padding: '7px 10px', borderRadius: 8, whiteSpace: 'pre-wrap', minWidth: 200, maxWidth: 280,
          zIndex: 99, boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ── Alert banners ─────────────────────────────────────────────────────────────

function AlertBanner({ level, message, tip }: { level: string; message: string; tip: string }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = {
    critical: { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', Icon: AlertCircle },
    warning:  { bg: '#fffbeb', border: '#fcd34d', color: '#92400e', Icon: AlertTriangle },
    info:     { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', Icon: Info },
  }[level] ?? { bg: '#f8fafc', border: '#e2e8f0', color: '#475569', Icon: Info };

  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <cfg.Icon size={16} color={cfg.color} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{message}</span>
        {tip && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ marginLeft: 8, fontSize: 11.5, color: cfg.color, opacity: .7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            {expanded ? 'menos' : '¿qué hago?'}
          </button>
        )}
        {expanded && tip && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: cfg.color, opacity: .85 }}>{tip}</div>
        )}
      </div>
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--teal)' }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--s800)' }}>{title}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 2, marginLeft: 24 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, tip, accent }: { label: string; value: React.ReactNode; tip?: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--s100)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--s500)' }}>
        {label}{tip && <Tip text={tip} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent ?? 'var(--s800)' }}>{value}</span>
    </div>
  );
}

function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--s500)' }}>Uso</span>
        <span style={{ fontSize: 24, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div style={{ background: 'var(--s100)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

function TenantBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--s50)', borderRadius: 10, padding: '10px 14px', minWidth: 64 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color }}>{count}</span>
      <span style={{ fontSize: 11, color: 'var(--s500)', marginTop: 2 }}>{label}</span>
    </div>
  );
}

// ── Maintenance panel ─────────────────────────────────────────────────────────

const ACTIONS = [
  {
    id: 'builder_prune',
    label: 'Limpiar cache de builds',
    description: 'Elimina el cache de compilación de Docker (principal causante del problema de disco). No afecta ningún servicio en ejecución.',
    danger: false,
  },
  {
    id: 'image_prune',
    label: 'Eliminar imágenes huérfanas',
    description: 'Borra imágenes Docker sin tag que ya no usa ningún contenedor. No toca postgres, redis, core-api ni ai-service.',
    danger: false,
  },
  {
    id: 'system_prune',
    label: 'Limpieza general Docker',
    description: 'Elimina contenedores detenidos, redes sin uso e imágenes sin tag. No toca volúmenes (datos de BD y audio están seguros).',
    danger: false,
  },
];

function MaintenancePanel() {
  const [output, setOutput] = useState<ActionResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (action: string) => adminApi.systemAction(action),
    onMutate: (action) => { setRunning(action); setOutput(null); },
    onSettled: (data) => { setRunning(null); if (data) setOutput(data); },
  });

  const confirm = (action: typeof ACTIONS[number]) => {
    if (!window.confirm(`¿Ejecutar "${action.label}"?\n\n${action.description}`)) return;
    run.mutate(action.id);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid var(--s200)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Wrench size={16} color="var(--teal)" />
        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--s800)' }}>Mantenimiento</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--s400)', marginBottom: 16, marginLeft: 24 }}>
        Comandos seguros — nunca tocan datos productivos ni contenedores activos
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ACTIONS.map(action => (
          <div key={action.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--s50)', borderRadius: 10, border: '1px solid var(--s100)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--s800)' }}>{action.label}</div>
              <div style={{ fontSize: 12, color: 'var(--s500)', marginTop: 3 }}>{action.description}</div>
            </div>
            <button
              onClick={() => confirm(action)}
              disabled={running !== null}
              style={{
                flexShrink: 0, border: 'none', borderRadius: 8, padding: '7px 14px',
                fontSize: 12.5, fontWeight: 700, cursor: running ? 'wait' : 'pointer',
                background: running === action.id ? 'var(--s300)' : 'var(--teal)', color: '#fff',
              }}
            >
              {running === action.id ? 'Ejecutando…' : 'Ejecutar'}
            </button>
          </div>
        ))}
      </div>

      {output && (
        <div style={{ marginTop: 16, borderRadius: 10, border: `1px solid ${output.ok ? '#bbf7d0' : '#fca5a5'}`, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: output.ok ? '#f0fdf4' : '#fef2f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: output.ok ? '#16a34a' : '#dc2626' }}>
              {output.ok ? '✓ Completado' : '✗ Error'} — {output.action} ({output.duration_ms}ms)
            </span>
            <button onClick={() => setOutput(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', fontSize: 16 }}>×</button>
          </div>
          <pre style={{ margin: 0, padding: '12px 14px', fontSize: 11.5, color: 'var(--s700)', background: '#f8fafc', overflowX: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {output.output || '(sin output)'}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Sistema tab ───────────────────────────────────────────────────────────────

function SistemaTab() {
  const [countdown, setCountdown] = useState(REFRESH_SEC);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: h, isLoading, refetch, isFetching } = useQuery<SystemHealth>({
    queryKey: ['admin-system-health'],
    queryFn: adminApi.systemHealth,
    refetchInterval: REFRESH_SEC * 1000,
  });

  useEffect(() => {
    setCountdown(REFRESH_SEC);
    intervalRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { return REFRESH_SEC; }
        return c - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [h]);

  if (isLoading) return <div style={{ fontSize: 14, color: 'var(--s400)', padding: '24px 0' }}>Cargando métricas…</div>;
  if (!h) return null;

  const diskColor = pctColor(h.disk.used_pct);
  const memColor  = pctColor(h.mem.used_pct);
  const aiAlert   = h.ai_queue.error > 0 || h.ai_queue.processing > 8;

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--s400)' }}>
          Uptime: <strong style={{ color: 'var(--s700)' }}>{fmtUptime(h.uptime_sec)}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--s400)' }}>Actualiza en {countdown}s</span>
          <button
            onClick={() => { refetch(); setCountdown(REFRESH_SEC); }}
            disabled={isFetching}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--s200)', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--s600)' }}
          >
            <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Alerts */}
      {h.alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {h.alerts.map(a => <AlertBanner key={a.code} level={a.level} message={a.message} tip={a.tip} />)}
        </div>
      )}

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 14 }}>

        {/* Disco */}
        <MetricCard icon={<HardDrive size={16} />} title="Disco" subtitle="Almacenamiento del VPS (SSD de 40 GB total)">
          <UsageBar pct={h.disk.used_pct} color={diskColor} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Usado" value={`${h.disk.used_gb} GB`} accent={diskColor}
              tip="Espacio ocupado por el sistema, Docker, logs, BD y código." />
            <StatRow label="Libre" value={`${h.disk.free_gb} GB`}
              tip="Espacio disponible. Si llega a 0, PostgreSQL crashea y la app cae." />
            <StatRow label="Total" value={`${h.disk.total_gb} GB`}
              tip="Capacidad total del disco del VPS Hetzner CX21." />
          </div>
        </MetricCard>

        {/* Memoria RAM */}
        <MetricCard icon={<MemoryStick size={16} />} title="Memoria RAM" subtitle="RAM del VPS (4 GB total en CX21)">
          <UsageBar pct={h.mem.used_pct} color={memColor} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Usada" value={`${h.mem.used_gb} GB`} accent={memColor}
              tip="Incluye core-api, ai-service, postgres, redis y el SO." />
            <StatRow label="Libre" value={`${h.mem.free_gb} GB`}
              tip="RAM disponible. Con poca RAM libre el sistema empieza a usar swap (lento)." />
            <StatRow label="Total" value={`${h.mem.total_gb} GB`}
              tip="RAM del VPS. Upgrade a CX31 da 8 GB." />
          </div>
        </MetricCard>

        {/* Base de datos */}
        <MetricCard icon={<Database size={16} />} title="Base de datos" subtitle="PostgreSQL 16 — datos clínicos cifrados">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Tamaño total" value={`${h.db.size_mb} MB`}
              tip="Tamaño de toda la base de datos, incluyendo índices y tablas del sistema." />
            <StatRow label="Conexiones activas" value={h.db.active_conns}
              tip="Queries en ejecución en este momento. Alto uso = solicitudes lentas." />
            <StatRow label="Conexiones inactivas" value={h.db.idle_conns}
              tip="Conexiones del pool listas para usar. Tener varias disponibles es normal y saludable." />
            <StatRow label="Pool total" value={h.db.total_conns}
              tip="Total de conexiones que core-api mantiene abiertas con PostgreSQL." />
          </div>
          {h.db.top_tables.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Tablas más grandes
              </div>
              {h.db.top_tables.map(t => (
                <StatRow key={t.name} label={t.name} value={`${t.size_mb} MB`} />
              ))}
            </div>
          )}
        </MetricCard>

        {/* Redis */}
        <MetricCard icon={<Cpu size={16} />} title="Redis" subtitle="Caché y cola de jobs de IA">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Estado" value={h.redis.ok ? '● Online' : '● Offline'}
              accent={h.redis.ok ? '#16a34a' : '#dc2626'}
              tip="Redis gestiona las sesiones activas y la cola de borradores IA. Si cae, la app funciona pero sin IA ni sesiones." />
            <StatRow label="Latencia ping" value={`${h.redis.ping_ms} ms`}
              tip="Tiempo de respuesta de Redis. < 2ms es excelente; > 10ms indica problema de red interna." />
            <StatRow label="Memoria usada" value={h.redis.used_memory_human || '—'}
              tip="RAM que Redis ocupa para las colas y el caché de sesiones." />
          </div>
        </MetricCard>

        {/* Tenants */}
        <MetricCard icon={<Users size={16} />} title="Tenants" subtitle="Organizaciones registradas en el sistema">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <TenantBadge label="activos" count={h.tenants.active} color="#16a34a" />
            <TenantBadge label="trial" count={h.tenants.trialing} color="#0f766e" />
            <TenantBadge label="vencidos" count={h.tenants.past_due} color="#d97706" />
            <TenantBadge label="cancelados" count={h.tenants.canceled} color="#9ca3af" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Total usuarios" value={h.tenants.total_users}
              tip="Suma de todos los profesionales y admins de todas las organizaciones." />
            <StatRow label="Total pacientes" value={h.tenants.total_patients}
              tip="Pacientes registrados en toda la plataforma. Crece con cada nueva clínica." />
          </div>
        </MetricCard>

        {/* Cola IA */}
        <MetricCard icon={<Bot size={16} />} title={`Cola IA${aiAlert ? ' ⚠️' : ''}`} subtitle="Borradores clínicos generados por Whisper + Claude">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Pendientes" value={h.ai_queue.pending}
              tip="En espera de ser procesados. Es normal tener algunos; > 20 puede indicar que el ai-service está lento." />
            <StatRow label="Procesando" value={h.ai_queue.processing}
              accent={h.ai_queue.processing > 8 ? '#d97706' : undefined}
              tip="Transcribiendo audio o generando borrador con Claude ahora mismo." />
            <StatRow label="Listos para revisar" value={h.ai_queue.draft_ready}
              accent={h.ai_queue.draft_ready > 0 ? '#0f766e' : undefined}
              tip="Borradores generados que el profesional aún no ha revisado ni aprobado." />
            <StatRow label="Con error" value={h.ai_queue.error}
              accent={h.ai_queue.error > 0 ? '#dc2626' : undefined}
              tip="Borradores que fallaron (audio roto, timeout de Claude, etc). El profesional no puede verlos; revisar logs de ai-service." />
          </div>
        </MetricCard>

      </div>

      {/* Maintenance */}
      <MaintenancePanel />

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
  const [tab, setTab] = useState<Tab>('sistema');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'sistema', label: 'Sistema', icon: <Activity size={14} /> },
    { id: 'tenants', label: 'Tenants', icon: <Building2 size={14} /> },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Building2 size={22} color="var(--teal)" />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>Operador SaaS</h1>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--s500)', marginBottom: 22 }}>
        Consola de administración global — monitoreo del sistema y gestión de tenants.
      </p>

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

      {tab === 'sistema' && <SistemaTab />}
      {tab === 'tenants' && <TenantsTab />}
    </div>
  );
}
