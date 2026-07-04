import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HardDrive, Database,
  Cpu, Users, Bot, RefreshCw, AlertTriangle, Info,
  AlertCircle, MemoryStick,
  CreditCard, Lock, Unlock, CheckCircle, XCircle, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import { adminApi, type AdminOrg, type AdminOrgUser, type SystemHealth, type PlatformMPConfig } from '@/api/admin';
import { authApi } from '@/api/auth';
import { legalApi, type LegalDoc } from '@/api/legal';
import { ConfirmByTextModal } from '@/components/ui/ConfirmByTextModal';
import { Markdown } from '@/components/common/Markdown';
import { useIsMobile } from '@/lib/useMediaQuery';

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
          background: '#22214a', color: '#fff', fontSize: 11.5, lineHeight: 1.5,
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
  }[level] ?? { bg: '#faf6ec', border: '#e7dcc0', color: '#4a4560', Icon: Info };

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
  const cpuColor  = pctColor(h.cpu_pct);
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
      {(h.alerts ?? []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {(h.alerts ?? []).map(a => <AlertBanner key={a.code} level={a.level} message={a.message} tip={a.tip} />)}
        </div>
      )}

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 14 }}>

        {/* CPU */}
        <MetricCard icon={<Cpu size={16} />} title="CPU" subtitle="Uso del procesador del VPS (1 vCPU Hetzner CX21)">
          <UsageBar pct={h.cpu_pct} color={cpuColor} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <StatRow label="Uso actual" value={`${h.cpu_pct}%`} accent={cpuColor}
              tip={`Porcentaje de CPU consumido en este momento (promedio 150ms).\n\n✅ <30% = sin carga\n⚠️ 50–80% = carga moderada\n🔴 >80% = saturado — los requests pueden empezar a encolarse\n\nCon 1 sola vCPU, picos cortos son normales. Preocúpate si se mantiene alto por más de 1–2 minutos.`} />
            <StatRow label="Núcleos" value="1 vCPU"
              tip="Hetzner CX21 tiene 1 vCPU compartida. Si necesitas más capacidad de cómputo, el upgrade a CX31 da 2 vCPUs." />
          </div>
        </MetricCard>

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

        {/* PostgreSQL avanzado */}
        <MetricCard icon={<Database size={16} />} title="PostgreSQL — Rendimiento" subtitle="Métricas de salud interna del motor de base de datos">
          {(() => {
            const pg = h.pg;
            const hitColor = pg.buffer_hit_pct >= 99 ? '#16a34a' : pg.buffer_hit_pct >= 95 ? '#d97706' : '#dc2626';
            const fmtNum = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : String(n);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <StatRow label="Buffer cache hit ratio" value={`${pg.buffer_hit_pct}%`} accent={hitColor}
                  tip={`Porcentaje de lecturas respondidas desde RAM sin tocar el disco.\n\n✅ >99% = excelente (RAM suficiente)\n⚠️ 95–99% = aceptable\n🔴 <95% = PostgreSQL lee del disco frecuentemente → lento\n\nSin carga real este dato no es significativo.`} />
                <StatRow label="Transacciones confirmadas" value={fmtNum(pg.commits)}
                  tip={`Total de operaciones exitosas (INSERT, UPDATE, DELETE, SELECT en transacción) desde el último reset de estadísticas (hace ${pg.stats_age_hours}h).\n\nEsto es el "contador de trabajo" de la BD.`} />
                <StatRow label="Transacciones revertidas" value={fmtNum(pg.rollbacks)}
                  accent={pg.rollbacks > 0 ? '#d97706' : undefined}
                  tip={`Operaciones que fallaron y se deshicieron. Algunos rollbacks son normales (ej. validaciones). Si es muy alto en proporción a los commits, puede indicar errores frecuentes en la app.`} />
                <StatRow label="Deadlocks históricos" value={pg.deadlocks}
                  accent={pg.deadlocks > 0 ? '#dc2626' : '#16a34a'}
                  tip={`Número de veces que dos operaciones se bloquearon mutuamente desde el último reset.\n\n✅ 0 = perfecto\n🔴 >0 = hubo conflictos — dos procesos querían escribir el mismo registro al mismo tiempo.`} />
                <StatRow label="Queries lentas ahora (>5s)" value={pg.slow_queries}
                  accent={pg.slow_queries > 0 ? '#dc2626' : '#16a34a'}
                  tip={`Queries que llevan más de 5 segundos ejecutándose en este momento.\n\n✅ 0 = normal\n🔴 >0 = hay una consulta que está tardando — puede estar bloqueando otros requests.`} />
                <StatRow label="Locks en espera" value={pg.active_locks}
                  accent={pg.active_locks > 0 ? '#d97706' : '#16a34a'}
                  tip={`Operaciones bloqueadas esperando que otra libere un recurso (fila o tabla).\n\n✅ 0 = sin bloqueos\n⚠️ >0 = hay contención — una operación está esperando a otra.\n\nAlgo temporal es normal; si persiste indica un problema de concurrencia.`} />
                <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 6 }}>
                  Estadísticas desde hace {pg.stats_age_hours}h
                </div>
              </div>
            );
          })()}
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
            <TenantBadge label="trial" count={h.tenants.trialing} color="#2a2769" />
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
              accent={h.ai_queue.draft_ready > 0 ? '#2a2769' : undefined}
              tip="Borradores generados que el profesional aún no ha revisado ni aprobado." />
            <StatRow label="Con error" value={h.ai_queue.error}
              accent={h.ai_queue.error > 0 ? '#dc2626' : undefined}
              tip="Borradores que fallaron (audio roto, timeout de Claude, etc). El profesional no puede verlos; revisar logs de ai-service." />
          </div>
        </MetricCard>

        {/* Backup */}
        {(() => {
          const bk = h.backup;
          const fmtDate = bk.last_ok_at
            ? new Date(bk.last_ok_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
            : null;
          return (
            <MetricCard
              icon={<HardDrive size={16} />}
              title={`Backup${bk.ok ? '' : ' ⚠️'}`}
              subtitle="pg_dump diario cifrado GPG → Backblaze B2 (cron 2am)"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <StatRow
                  label="Estado"
                  value={bk.ok ? '✅ Al día' : '🔴 Sin backup reciente'}
                  accent={bk.ok ? '#16a34a' : '#dc2626'}
                  tip={`El script backup.sh corre cada noche a las 2am UTC:\n1. pg_dump → gzip → GPG encrypt (sin tocar texto plano)\n2. Valida el paquete GPG\n3. Sube a Backblaze B2 (retención 15 años por lifecycle rule)\n\n✅ Al día = backup de hace <26h\n🔴 Sin backup = no corrió o falló`}
                />
                {bk.last_ok_at ? (
                  <>
                    <StatRow
                      label="Último exitoso"
                      value={fmtDate ?? '—'}
                      tip={`Hace ${bk.hours_ago}h — el backup se completó y fue validado.`}
                    />
                    <StatRow
                      label="Tamaño"
                      value={bk.size_human}
                      tip="Tamaño del archivo .sql.gz.gpg en disco local antes de subir a B2. El cifrado GPG añade ~5% de overhead." />
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    Sin datos — el backup aún no ha corrido desde el último despliegue.
                  </div>
                )}
              </div>
            </MetricCard>
          );
        })()}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Tenants tab ───────────────────────────────────────────────────────────────

const REACTIVATE_ROLES = ['CLINIC_ADMIN', 'PROFESSIONAL', 'INTERN', 'RECEPTIONIST'] as const;

function OrgUsersPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-org-users', orgId],
    queryFn: () => adminApi.listOrgUsers(orgId),
  });
  const [pendingRemove, setPendingRemove] = useState<AdminOrgUser | null>(null);
  const [reactivatingRole, setReactivatingRole] = useState<Record<string, string>>({});
  const [reactivating, setReactivating] = useState<string | null>(null);

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    await adminApi.removeOrgUser(orgId, pendingRemove.id);
    qc.invalidateQueries({ queryKey: ['admin-org-users', orgId] });
    qc.invalidateQueries({ queryKey: ['admin-orgs'] });
    setPendingRemove(null);
  };

  const handleReactivate = async (u: AdminOrgUser) => {
    const role = reactivatingRole[u.id] ?? 'PROFESSIONAL';
    setReactivating(u.id);
    try {
      await adminApi.reactivateOrgUser(orgId, u.id, role);
      qc.invalidateQueries({ queryKey: ['admin-org-users', orgId] });
      qc.invalidateQueries({ queryKey: ['admin-orgs'] });
    } finally {
      setReactivating(null);
    }
  };

  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--s400)', padding: '8px 0' }}>Cargando usuarios…</div>;
  const users = data?.items ?? [];

  return (
    <div style={{ marginTop: 12 }}>
      {pendingRemove && (
        <ConfirmByTextModal
          title="Desactivar usuario"
          description={`"${pendingRemove.display_name || pendingRemove.email}" no podrá iniciar sesión. Sus registros clínicos se conservan y puede reincorporarse después.`}
          confirmText={pendingRemove.email}
          confirmLabel="Desactivar"
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        Usuarios ({users.length})
      </div>
      {users.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--s400)' }}>Sin usuarios.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {users.map(u => {
            const fmtLogin = u.last_login_at
              ? new Date(u.last_login_at).toLocaleDateString('es-CO')
              : 'nunca';
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                background: u.is_active ? '#fff' : '#fef2f2', border: '1px solid var(--s100)', fontSize: 12.5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: u.is_active ? 'var(--s800)' : '#9ca3af' }}>
                    {u.display_name || u.email}
                  </span>
                  {u.display_name && <span style={{ color: 'var(--s400)', marginLeft: 6 }}>{u.email}</span>}
                </div>
                <span style={{ fontSize: 11, background: '#f4eedd', borderRadius: 10, padding: '2px 8px', color: 'var(--s500)', whiteSpace: 'nowrap' }}>
                  {u.role_name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--s400)', whiteSpace: 'nowrap' }}>
                  login: {fmtLogin}
                </span>
                {!u.is_active && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>inactivo</span>
                    <select
                      value={reactivatingRole[u.id] ?? 'PROFESSIONAL'}
                      onChange={e => setReactivatingRole(prev => ({ ...prev, [u.id]: e.target.value }))}
                      style={{ fontSize: 11, border: '1px solid var(--s200)', borderRadius: 6, padding: '2px 4px', background: '#fff' }}
                    >
                      {REACTIVATE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => handleReactivate(u)}
                      disabled={reactivating === u.id}
                      title="Reincorporar usuario"
                      style={{ border: 'none', background: '#dcfce7', color: '#16a34a', cursor: reactivating === u.id ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                      {reactivating === u.id ? '…' : 'Reincorporar'}
                    </button>
                  </div>
                )}
                {u.is_active && (
                  <button
                    onClick={() => setPendingRemove(u)}
                    title="Desactivar usuario"
                    style={{ border: 'none', background: 'transparent', color: '#dc2626',
                      cursor: 'pointer', fontSize: 14, padding: '2px 4px', borderRadius: 4 }}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:    { label: 'Activo',    color: '#16a34a' },
  trialing:  { label: 'Trial',     color: '#2a2769' },
  past_due:  { label: 'Vencido',   color: '#b45309' },
  suspended: { label: 'Suspendido',color: '#d97706' },
  canceled:  { label: 'Cancelado', color: '#dc2626' },
};

// Values match the "¿Cómo nos conociste?" select on the public signup form.
const REFERRAL_LABELS: Record<string, string> = {
  recommendation: 'Recomendación de un colega',
  google:         'Búsqueda en Google',
  social:         'Redes sociales',
  other:          'Otro',
};

function TenantsTab() {
  const qc = useQueryClient();
  const { data: orgs, isLoading } = useQuery({ queryKey: ['admin-orgs'], queryFn: adminApi.listOrgs });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invalidate = () => { setBusyId(null); qc.invalidateQueries({ queryKey: ['admin-orgs'] }); };

  const activate    = useMutation({ mutationFn: ({ id, months }: { id: string; months: number }) => adminApi.activateOrg(id, months), onSettled: invalidate });
  const suspend     = useMutation({ mutationFn: (id: string) => adminApi.suspendOrg(id), onSettled: invalidate });
  const cancel      = useMutation({ mutationFn: (id: string) => adminApi.cancelOrg(id), onSettled: invalidate });
  const extendTrial = useMutation({ mutationFn: ({ id, days }: { id: string; days: number }) => adminApi.extendTrial(id, days), onSettled: invalidate });

  const handleActivate = (o: AdminOrg) => {
    const input = window.prompt(`Activar "${o.name}" — ¿cuántos meses?`, '1');
    if (!input) return;
    const months = parseInt(input, 10);
    if (!Number.isInteger(months) || months < 1 || months > 36) { alert('Ingresa entre 1 y 36.'); return; }
    setBusyId(o.id); activate.mutate({ id: o.id, months });
  };
  const handleSuspend = (o: AdminOrg) => {
    if (!window.confirm(`¿Suspender "${o.name}"? Los usuarios no podrán ingresar hasta que se reactiven.`)) return;
    setBusyId(o.id); suspend.mutate(o.id);
  };
  const handleCancel = (o: AdminOrg) => {
    if (!window.confirm(`¿CANCELAR "${o.name}"? Esto es definitivo — usa Suspender si solo quieres bloquear temporalmente.`)) return;
    setBusyId(o.id); cancel.mutate(o.id);
  };
  const handleExtendTrial = (o: AdminOrg) => {
    const input = window.prompt(`Extender trial de "${o.name}" — ¿cuántos días?`, '30');
    if (!input) return;
    const days = parseInt(input, 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) { alert('Ingresa entre 1 y 365.'); return; }
    setBusyId(o.id); extendTrial.mutate({ id: o.id, days });
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    border: 'none', background: color, color: '#fff', fontSize: 11.5, fontWeight: 600,
    borderRadius: 7, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <>
      {isLoading ? (
        <div style={{ fontSize: 14, color: 'var(--s400)' }}>Cargando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(orgs ?? []).map(o => {
            const st = STATUS_LABELS[o.subscription_status] ?? { label: o.subscription_status, color: '#9ca3af' };
            const until = o.current_period_end ?? o.trial_ends_at;
            const busy = busyId === o.id;
            const expanded = expandedId === o.id;
            return (
              <div key={o.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', overflow: 'hidden' }}>
                {/* Row principal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
                  onClick={() => setExpandedId(expanded ? null : o.id)}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--s800)', fontSize: 14 }}>{o.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--s400)' }}>{o.slug}</div>
                  </div>
                  {/* Badges */}
                  <span style={{ fontWeight: 700, fontSize: 12, color: st.color, background: st.color + '18',
                    borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>{st.label}</span>
                  <div style={{ fontSize: 12, color: 'var(--s500)', whiteSpace: 'nowrap' }}>
                    <span title="Usuarios">👥 {o.total_users}</span>
                    <span style={{ marginLeft: 8 }} title="Pacientes">🗂 {o.total_patients}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--s400)', whiteSpace: 'nowrap' }}>{fmtDate(until)}</div>
                  <span style={{ fontSize: 16, color: 'var(--s300)', userSelect: 'none' }}>{expanded ? '▲' : '▼'}</span>
                </div>

                {/* Panel expandible de acciones */}
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--s100)', padding: '12px 16px', background: 'var(--s50)' }}>
                    {/* Contacto y origen del lead (formulario de signup) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: 'var(--s600)', marginBottom: 12 }}>
                      {o.owner_email && (
                        <span>✉️ <a href={`mailto:${o.owner_email}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>{o.owner_email}</a></span>
                      )}
                      {o.signup_phone && (
                        <span>💬 <a href={`https://wa.me/${o.signup_phone}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>WhatsApp {o.signup_phone}</a></span>
                      )}
                      {o.signup_source && (
                        <span>📣 Nos conoció: <strong>{REFERRAL_LABELS[o.signup_source] ?? o.signup_source}</strong></span>
                      )}
                      {!o.owner_email && !o.signup_phone && !o.signup_source && (
                        <span style={{ color: 'var(--s400)' }}>Sin datos de contacto del registro.</span>
                      )}
                    </div>
                    {/* Usuarios de la org */}
                    <OrgUsersPanel orgId={o.id} />
                    <div style={{ height: 12 }} />
                    {/* Acciones */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--s500)', marginRight: 4 }}>Acciones:</span>

                    <button style={btnStyle('var(--teal)')} disabled={busy} onClick={() => handleActivate(o)}>
                      ✅ Activar meses
                    </button>

                    {o.subscription_status !== 'active' && (
                      <button style={btnStyle('#2a2769')} disabled={busy} onClick={() => handleExtendTrial(o)}>
                        ⏱ Extender trial
                      </button>
                    )}

                    {o.subscription_status !== 'suspended' && o.subscription_status !== 'canceled' && (
                      <button style={btnStyle('#d97706')} disabled={busy} onClick={() => handleSuspend(o)}>
                        ⏸ Suspender
                      </button>
                    )}

                    {o.subscription_status === 'suspended' && (
                      <button style={btnStyle('#2a2769')} disabled={busy} onClick={() => handleExtendTrial(o)}>
                        ▶ Reactivar (extender trial)
                      </button>
                    )}

                    {o.subscription_status !== 'canceled' && (
                      <button style={btnStyle('#dc2626')} disabled={busy} onClick={() => handleCancel(o)}>
                        ✕ Cancelar cuenta
                      </button>
                    )}

                    {busy && <span style={{ fontSize: 12, color: 'var(--s400)' }}>Procesando…</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(orgs ?? []).length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--s400)', padding: '24px 0', fontSize: 14 }}>
              Aún no hay organizaciones.
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Legal CMS ─────────────────────────────────────────────────────────────────

type LegalDocType = 'terms' | 'privacy' | 'dpa';

const LEGAL_LABELS: Record<LegalDocType, string> = {
  terms:   'Términos y Condiciones',
  privacy: 'Política de Privacidad',
  dpa:     'Acuerdo de Tratamiento (DPA)',
};

function LegalEditor({ docType }: { docType: LegalDocType }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<LegalDoc>({
    queryKey: ['legal', docType],
    queryFn: () => legalApi.get(docType),
  });
  const [body, setBody] = useState('');
  const [version, setVersion] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data) { setBody(data.body_md); setVersion(data.version); }
  }, [data]);

  const handlePublish = async () => {
    if (!body.trim() || !version.trim()) return;
    setSaving(true); setMsg('');
    try {
      await legalApi.publish(docType, version, body);
      qc.invalidateQueries({ queryKey: ['legal', docType] });
      setMsg('Publicado correctamente.');
    } catch { setMsg('Error al publicar.'); }
    finally { setSaving(false); }
  };

  if (isLoading) return <div style={{ padding: 20, color: 'var(--s400)', fontSize: 13 }}>Cargando…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Versión (YYYY-MM-DD o semver)</label>
          <input
            value={version}
            onChange={e => setVersion(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13 }}
          />
        </div>
        <button
          onClick={() => setPreview(p => !p)}
          style={{ marginTop: 20, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--s200)', background: preview ? 'var(--s100)' : '#fff', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
          {preview ? 'Editar' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div style={{ border: '1.5px solid var(--s200)', borderRadius: 10, padding: '16px 20px', minHeight: 300, background: '#fafafa' }}>
          <Markdown content={body} />
        </div>
      ) : (
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={22}
          placeholder="Escribe el contenido en Markdown…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--s200)', fontSize: 13, fontFamily: "'DM Mono', monospace", resize: 'vertical', outline: 'none' }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handlePublish}
          disabled={saving || !body.trim() || !version.trim()}
          style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: saving ? 'var(--s300)' : 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Publicando…' : 'Publicar nueva versión'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#dc2626' : '#16a34a' }}>{msg}</span>}
      </div>
    </div>
  );
}

function LegalTab() {
  const [docType, setDocType] = useState<LegalDocType>('terms');

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {(['terms', 'privacy', 'dpa'] as LegalDocType[]).map(t => (
          <button key={t} onClick={() => setDocType(t)}
            style={{ padding: '6px 14px', borderRadius: 99, border: '1.5px solid', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              borderColor: docType === t ? 'var(--teal)' : 'var(--s200)',
              background: docType === t ? '#f3f2fb' : '#fff',
              color: docType === t ? 'var(--teal)' : 'var(--s500)' }}>
            {LEGAL_LABELS[t]}
          </button>
        ))}
      </div>
      <LegalEditor docType={docType} />
    </div>
  );
}

// ── Plataforma tab ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'db' | 'env' | 'none' }) {
  const colors: Record<string, { bg: string; color: string; label: string }> = {
    db:   { bg: '#ecfdf5', color: '#059669', label: 'BD' },
    env:  { bg: '#eff6ff', color: '#2563eb', label: 'ENV' },
    none: { bg: '#fef2f2', color: '#dc2626', label: 'No configurado' },
  };
  const s = colors[source] ?? colors.none;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function TokenRotateForm({ label, field, onSaved }: {
  label: string;
  field: 'access_token' | 'webhook_secret';
  onSaved: () => void;
}) {
  const [val, setVal]   = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr]   = useState('');
  const mut = useMutation({
    mutationFn: () => adminApi.updatePlatformTokens({ [field]: val }),
    onSuccess: () => { setVal(''); setErr(''); onSaved(); },
    onError:   () => setErr('Error al guardar. Verifica el valor.'),
  });
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type={show ? 'text' : 'password'}
            placeholder={`Nuevo ${label}`}
            value={val}
            onChange={e => setVal(e.target.value)}
            style={{ width: '100%', padding: '7px 36px 7px 10px', border: '1.5px solid var(--s200)', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }}
          />
          <button onClick={() => setShow(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 2 }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button
          onClick={() => { if (!val.trim()) { setErr('El campo no puede estar vacío'); return; } mut.mutate(); }}
          disabled={mut.isPending}
          style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          {mut.isPending ? '...' : 'Guardar'}
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{err}</p>}
    </div>
  );
}

function PlataformaTab() {
  const qc = useQueryClient();
  const [unlocked, setUnlocked] = useState(false);
  const [pwd, setPwd]           = useState('');
  const [pwdErr, setPwdErr]     = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const [rotatingToken,  setRotatingToken]  = useState(false);
  const [rotatingSecret, setRotatingSecret] = useState(false);

  const { data: cfg, isLoading } = useQuery<PlatformMPConfig>({
    queryKey: ['admin', 'platform-mp'],
    queryFn: adminApi.getPlatformMP,
    enabled: unlocked,
    refetchOnWindowFocus: false,
  });

  // Plain-text editable fields
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [enforce, setEnforce] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    if (cfg) {
      setAmount(String(cfg.plan_amount));
      setReason(cfg.plan_reason);
      setEnforce(cfg.webhook_enforce);
    }
  }, [cfg]);

  const handleUnlock = async () => {
    if (!pwd) { setPwdErr('Ingresa tu contraseña'); return; }
    setUnlocking(true); setPwdErr('');
    try {
      await authApi.verifyPassword(pwd);
      setUnlocked(true); setPwd('');
    } catch {
      setPwdErr('Contraseña incorrecta');
    } finally {
      setUnlocking(false);
    }
  };

  const handleSavePlan = async () => {
    setSaving(true); setSaveErr(''); setSaveOk(false);
    try {
      const n = parseInt(amount, 10);
      if (isNaN(n) || n <= 0) throw new Error('Monto inválido');
      await adminApi.updatePlatformMP({ plan_amount: n, plan_reason: reason, webhook_enforce: enforce });
      qc.invalidateQueries({ queryKey: ['admin', 'platform-mp'] });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Lock size={26} color="#d97706" />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', marginBottom: 8 }}>Configuración protegida</h3>
        <p style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 20 }}>
          Confirma tu contraseña de operador para acceder a la configuración de MercadoPago de la plataforma.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            placeholder="Contraseña"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            autoFocus
            style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--s200)', borderRadius: 8, fontSize: 14 }}
          />
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            {unlocking ? '...' : 'Desbloquear'}
          </button>
        </div>
        {pwdErr && <p style={{ fontSize: 12.5, color: '#dc2626', marginTop: 8 }}>{pwdErr}</p>}
      </div>
    );
  }

  return (
    <div>
      {/* Unlock banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          <Unlock size={15} color="#92400e" />
          Configuración de plataforma desbloqueada
        </div>
        <button onClick={() => setUnlocked(false)} style={{ fontSize: 12, color: '#92400e', background: 'none', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
          Bloquear
        </button>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--s400)', fontSize: 13 }}>Cargando...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Plan config */}
          <div style={{ background: '#fff', border: '1px solid var(--s100)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <CreditCard size={17} color="var(--teal)" />
              <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--s800)' }}>Plan de suscripción</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s500)', display: 'block', marginBottom: 4 }}>Precio mensual (COP)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--s200)', borderRadius: 7, fontSize: 13.5, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s500)', display: 'block', marginBottom: 4 }}>Descripción en MercadoPago</label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--s200)', borderRadius: 7, fontSize: 13.5, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--s700)' }}>
                <input type="checkbox" checked={enforce} onChange={e => setEnforce(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--teal)', cursor: 'pointer' }} />
                Rechazar webhooks con firma inválida (MP_WEBHOOK_ENFORCE)
              </label>
            </div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={handleSavePlan}
                disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {saveOk && <span style={{ fontSize: 12.5, color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={13} /> Guardado</span>}
              {saveErr && <span style={{ fontSize: 12.5, color: '#dc2626' }}>{saveErr}</span>}
            </div>
          </div>

          {/* Credentials */}
          <div style={{ background: '#fff', border: '1px solid var(--s100)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <KeyRound size={17} color="#5b52ad" />
              <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--s800)' }}>Credenciales MercadoPago</span>
            </div>

            {/* Access token */}
            <div style={{ borderBottom: '1px solid var(--s100)', paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 4 }}>Access Token (suscripciones)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {cfg?.access_token_set
                      ? <CheckCircle size={14} color="#059669" />
                      : <XCircle size={14} color="#dc2626" />}
                    <span style={{ fontSize: 12.5, color: 'var(--s500)' }}>
                      {cfg?.access_token_set ? 'Configurado' : 'No configurado'}
                    </span>
                    {cfg && <SourceBadge source={cfg.access_token_source} />}
                  </div>
                </div>
                <button
                  onClick={() => setRotatingToken(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid var(--s200)', background: '#fff', fontSize: 12.5, fontWeight: 600, color: 'var(--s600)', cursor: 'pointer' }}
                >
                  <RefreshCw size={12} /> Rotar token
                </button>
              </div>
              {rotatingToken && (
                <TokenRotateForm label="Access Token" field="access_token" onSaved={() => {
                  setRotatingToken(false);
                  qc.invalidateQueries({ queryKey: ['admin', 'platform-mp'] });
                }} />
              )}
            </div>

            {/* Webhook secret */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 4 }}>Webhook Secret (firma de notificaciones)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {cfg?.webhook_secret_set
                      ? <CheckCircle size={14} color="#059669" />
                      : <XCircle size={14} color="#dc2626" />}
                    <span style={{ fontSize: 12.5, color: 'var(--s500)' }}>
                      {cfg?.webhook_secret_set ? 'Configurado' : 'No configurado'}
                    </span>
                    {cfg && <SourceBadge source={cfg.webhook_secret_source} />}
                  </div>
                </div>
                <button
                  onClick={() => setRotatingSecret(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid var(--s200)', background: '#fff', fontSize: 12.5, fontWeight: 600, color: 'var(--s600)', cursor: 'pointer' }}
                >
                  <RefreshCw size={12} /> Rotar secret
                </button>
              </div>
              {rotatingSecret && (
                <TokenRotateForm label="Webhook Secret" field="webhook_secret" onSaved={() => {
                  setRotatingSecret(false);
                  qc.invalidateQueries({ queryKey: ['admin', 'platform-mp'] });
                }} />
              )}
            </div>
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--s400)', margin: 0 }}>
            Los valores guardados aquí (BD) tienen prioridad sobre las variables de entorno del servidor. El cache se renueva cada 5 minutos; los cambios aplican sin reiniciar el servicio.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'sistema' | 'tenants' | 'plataforma' | 'legal';
const TAB_TITLES: Record<Tab, string> = {
  sistema:    'Sistema',
  tenants:    'Tenants',
  plataforma: 'Plataforma',
  legal:      'Legal',
};

export function SuperAdminPage() {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'sistema';
  const tab: Tab = (['sistema', 'tenants', 'plataforma', 'legal'] as Tab[]).includes(rawTab as Tab)
    ? (rawTab as Tab)
    : 'sistema';

  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? '14px 12px' : '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: '0 0 24px' }}>
        {TAB_TITLES[tab]}
      </h1>

      {tab === 'sistema'    && <SistemaTab />}
      {tab === 'tenants'    && <TenantsTab />}
      {tab === 'legal'      && <LegalTab />}
      {tab === 'plataforma' && <PlataformaTab />}
    </div>
  );
}
