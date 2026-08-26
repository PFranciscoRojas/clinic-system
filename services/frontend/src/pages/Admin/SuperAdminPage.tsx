import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Database, Cpu, Users, Bot, RefreshCw, AlertTriangle, Info, AlertCircle, MemoryStick, CreditCard, Lock, Unlock, CheckCircle, XCircle, Eye, EyeOff, KeyRound, CalendarClock, TrendingUp, Rocket, ExternalLink } from 'lucide-react';
import { adminApi, type AdminOrg, type AdminOrgUser, type SystemHealth, type PlatformMPConfig, type ActivationMetrics } from '@/api/admin';
import { leadBookingAdminApi, type LeadAgendaSettings } from '@/api/leadBooking';
import { authApi } from '@/api/auth';
import { legalApi, type LegalDoc } from '@/api/legal';
import { ConfirmByTextModal } from '@/components/ui/ConfirmByTextModal';
import { Markdown } from '@/components/common/Markdown';
import { useIsMobile } from '@/lib/useMediaQuery';
import { orgAccess } from '@/lib/subscription';

// El piso de MercadoPago para un cobro en Colombia. Vive también en Go
// (mercadopago.MinChargeCOP), que es quien lo hace cumplir; esta copia solo
// existe para no mandar una petición que ya se sabe que va a fallar.
const MP_MIN_CHARGE_COP = 1600;

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

// Qué build está respondiendo, leído del propio binario que contesta.
//
// Existe porque con dos colores delante de Caddy "¿está desplegado el arreglo?"
// dejó de tener respuesta obvia: el registro del workflow dice qué se desplegó,
// no qué está sirviendo ahora. Cuando este número y el de Actions no coinciden,
// algo se rompió en el camino — y eso antes no se podía ver desde ningún lado.
//
// "dev" significa un binario que nunca pasó por CI. Se muestra tal cual, sin
// disfrazarlo de hash, porque es justo el caso en que conviene mirar dos veces.
function BuildBadge({ build }: { build: SystemHealth['build'] }) {
  if (!build) return null;
  const dev = build.version === 'dev';
  const colour = build.colour === 'blue' ? '#2563eb'
               : build.colour === 'green' ? '#059669'
               : 'var(--s400)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        title={`Build ${build.version}`}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11.5, padding: '2px 7px', borderRadius: 6,
          background: dev ? '#fef3c7' : 'var(--s100)',
          color: dev ? '#92400e' : 'var(--s600)',
          border: `1px solid ${dev ? '#fcd34d' : 'var(--s200)'}`,
        }}
      >
        {dev ? 'dev (sin CI)' : build.version.slice(0, 7)}
      </span>
      {build.release && <Release value={build.release} />}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--s500)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
        {build.colour}
      </span>
      <span style={{ color: build.migration_dirty ? '#dc2626' : 'var(--s400)' }}>
        migración {build.migration_version}
        {build.migration_dirty && ' · SUCIA'}
      </span>
    </span>
  );
}

// El botón de volver atrás vive fuera de la aplicación. Ver la nota al pie de
// DeploySection y docs/ops/PLAN_RELEASE.md § "Por qué el botón de rollback NO va
// dentro de la aplicación".
const REPO_URL = 'https://github.com/PFranciscoRojas/clinic-system';
const ROLLBACK_URL = `${REPO_URL}/actions/workflows/rollback.yml`;

// Los enlaces al diff los resuelve el navegador, no esta aplicación. Esa es la
// diferencia que los hace posibles: para saber qué hay mergeado y sin desplegar
// haría falta preguntarle a la API de GitHub, y meter api.github.com en la lista
// de hosts salientes del servicio que guarda historias clínicas no lo vale. Un
// enlace no llama a nadie hasta que alguien lo pulsa, y entonces llama desde el
// navegador de quien lo pulsó.
function DiffLink({ from, to, children }: { from: string; to: string; children: React.ReactNode }) {
  if (!from || !to || from === to) return null;
  return (
    <a
      href={`${REPO_URL}/compare/${from}...${to}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontSize: 11.5, color: '#4338ca', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
    >
      {children} <ExternalLink size={10} />
    </a>
  );
}

function fmtAgo(iso: string | null) {
  if (!iso) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'hace un momento';
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  return `hace ${Math.floor(sec / 86400)} d`;
}

function shortSha(sha: string) {
  if (!sha) return '—';
  if (sha === 'latest' || sha === 'dev') return sha;
  return sha.slice(0, 7);
}

// El número legible. Se muestra al lado del SHA, no en su lugar: la versión
// sirve para hablar de un build y el SHA para señalarlo sin ambigüedad.
function Release({ value }: { value: string }) {
  if (!value) return null;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: '1px 7px', borderRadius: 5,
      background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe',
    }}>{value}</span>
  );
}

// Lo que de verdad contesta "¿a qué estoy volviendo?". Un hash no dice nada y un
// número dice poco; el asunto del commit sí.
function Subject({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div style={{ fontSize: 12, color: 'var(--s500)', paddingLeft: 130, marginTop: -4, marginBottom: 2 }}>
      {text}
    </div>
  );
}

function Sha({ value }: { value: string }) {
  return (
    <code style={{
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5,
      padding: '1px 6px', borderRadius: 5, background: 'var(--s100)', color: 'var(--s600)',
    }}>{shortSha(value)}</code>
  );
}

function ColourDot({ colour }: { colour: string }) {
  const c = colour === 'blue' ? '#2563eb' : colour === 'green' ? '#059669' : 'var(--s300)';
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />;
}

// Qué se ha desplegado y a qué se puede volver.
//
// Todo lo que se ve aquí lo escribió el host en /var/lib/sghcp, porque esta
// aplicación no ve Docker y no debe verlo: darle el socket es lo que se quitó
// en el PR #107. La consola dice qué ES; qué va a salir lo dice GitHub.
function DeploySection({ deploy: d, runningVersion }: {
  deploy: SystemHealth['deploy'];
  runningVersion?: string;
}) {
  if (!d || !d.active_colour) return null;

  // El binario que contesta esta petición contra lo que el host anotó. Cuando
  // difieren, un despliegue se rompió a mitad: es exactamente la forma que tuvo
  // el fallo del montaje del 2026-08-20, donde el host creía haber cambiado de
  // color y el tráfico seguía en el anterior.
  const mismatch = !!runningVersion && runningVersion !== 'dev' && !!d.active_sha
    && d.active_sha !== 'latest' && !runningVersion.startsWith(d.active_sha)
    && !d.active_sha.startsWith(runningVersion);

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
    borderTop: '1px solid var(--s100)', fontSize: 13,
  };

  return (
    <div style={{ border: '1px solid var(--s200)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Rocket size={16} style={{ color: 'var(--s400)' }} />
        <strong style={{ fontSize: 13.5, color: 'var(--s700)' }}>Despliegues</strong>
      </div>
      <div style={{ fontSize: 12, color: 'var(--s400)', marginBottom: 6 }}>
        Lo que está sirviendo y a qué se puede volver. El despliegue corre a las 22:00 de Bogotá,
        así que durante el día es normal que haya cosas mergeadas y todavía sin salir.
      </div>

      {mismatch && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, margin: '8px 0' }}>
          El binario que responde dice <strong>{shortSha(runningVersion!)}</strong> y el servidor
          anotó <strong>{shortSha(d.active_sha)}</strong>. Un despliegue no terminó de aplicarse.
        </div>
      )}

      <div style={row}>
        <span style={{ minWidth: 120, color: 'var(--s400)' }}>Sirviendo</span>
        <ColourDot colour={d.active_colour} />
        <span style={{ color: 'var(--s700)' }}>{d.active_colour}</span>
        <Release value={d.active_version} />
        <Sha value={d.active_sha} />
        <span style={{ color: 'var(--s400)', fontSize: 12 }}>{fmtAgo(d.switched_at)}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12 }}>
          <DiffLink from={d.fallback_sha} to={d.active_sha}>qué entró</DiffLink>
          {/* Lo mergeado que todavía no ha salido. Con la ventana nocturna esto
              deja de ser raro y pasa a ser el estado normal durante el día. */}
          <DiffLink from={d.active_sha} to="main">pendiente de salir</DiffLink>
        </span>
      </div>
      <Subject text={d.active_subject} />

      <div style={row}>
        <span style={{ minWidth: 120, color: 'var(--s400)' }}>Vuelta atrás</span>
        {d.fallback_running ? (
          <>
            <ColourDot colour={d.fallback_colour} />
            <span style={{ color: 'var(--s700)' }}>{d.fallback_colour}</span>
            <Release value={d.fallback_version} />
            <Sha value={d.fallback_sha} />
            <span style={{ color: '#059669', fontSize: 12 }}>sigue encendida</span>
            <DiffLink from={d.active_sha} to={d.fallback_sha}>qué se desharía</DiffLink>
            <a
              href={ROLLBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto',
                border: '1px solid var(--s200)', borderRadius: 8, padding: '5px 10px',
                fontSize: 12.5, color: 'var(--s600)', textDecoration: 'none', background: '#fff',
              }}
            >
              Volver a esta versión <ExternalLink size={12} />
            </a>
          </>
        ) : (
          <span style={{ color: 'var(--s400)', fontSize: 12.5 }}>
            La versión anterior ya se apagó. Volver exige desplegar una del historial.
          </span>
        )}
      </div>

      <Subject text={d.fallback_running ? d.fallback_subject : ''} />

      {/* Por qué el botón se va a otra pestaña en vez de estar aquí. Sin esta
          línea la pregunta vuelve cada seis meses, y la respuesta importa. */}
      <div style={{ fontSize: 11.5, color: 'var(--s400)', paddingTop: 8, lineHeight: 1.5 }}>
        La versión anterior se queda encendida hasta el siguiente despliegue, que la apaga
        para reutilizar ese contenedor. No hay que apagarla a mano: cuesta 12 MiB y es la
        red de seguridad. Esa es la ventana en la que volver atrás es un clic.
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--s400)', paddingTop: 6, lineHeight: 1.5 }}>
        Volver atrás se ejecuta desde GitHub Actions, fuera de este servidor, a propósito:
        esta consola la sirve el mismo proceso que se querría revertir, así que un botón
        aquí estaría caído justo cuando hiciera falta. Desde la terminal es{' '}
        <code style={{ fontSize: 11 }}>deploy_switch.sh rollback</code>, que tarda ~2 s.
      </div>

      {d.history.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--s500)' }}>
            Historial ({d.history.length})
          </summary>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11.5, color: 'var(--s400)', marginBottom: 6 }}>
              Las imágenes siguen en GHCR etiquetadas por versión y por SHA, así que a
              cualquiera de estas se puede volver con{' '}
              <code>deploy_switch.sh deploy v0.9.2</code>.
            </div>
            {d.history.map((e, i) => (
              <div key={`${e.at}-${i}`} style={{ ...row, padding: '6px 0', flexWrap: 'wrap' }}>
                <span style={{ minWidth: 120, color: 'var(--s400)', fontSize: 12 }}>{fmtAgo(e.at)}</span>
                <ColourDot colour={e.colour} />
                <span style={{ color: 'var(--s500)', fontSize: 12 }}>{e.colour}</span>
                <Release value={e.version} />
                <Sha value={e.sha} />
                {/* El diff contra el despliegue inmediatamente anterior: el
                    antes y el después de esta línea concreta. La última de la
                    lista no tiene anterior con quien compararse. */}
                {d.history[i + 1] && (
                  <DiffLink from={d.history[i + 1].sha} to={e.sha}>antes y después</DiffLink>
                )}
                {e.subject && (
                  <span style={{ fontSize: 12, color: 'var(--s500)', flexBasis: '100%', paddingLeft: 130 }}>
                    {e.subject}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
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

function TenantBadge({ label, count, color, tip }: { label: string; count: number; color: string; tip?: string }) {
  return (
    <div title={tip} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--s50)', borderRadius: 10, padding: '10px 14px', minWidth: 64 }}>
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

  // Fresh health data restarts the visible countdown (render-time adjust);
  // the interval itself only ticks it down.
  const [prevH, setPrevH] = useState<SystemHealth | undefined>(undefined);
  if (h !== prevH) {
    setPrevH(h);
    setCountdown(REFRESH_SEC);
  }

  useEffect(() => {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, color: 'var(--s400)', flexWrap: 'wrap' }}>
          <span>Uptime: <strong style={{ color: 'var(--s700)' }}>{fmtUptime(h.uptime_sec)}</strong></span>
          <BuildBadge build={h.build} />
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

      {/* Despliegues */}
      <DeploySection deploy={h.deploy} runningVersion={h.build?.version} />

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
            <TenantBadge label="activos" count={h.tenants.active} color="#16a34a"
              tip="Plan pagado vigente: pueden entrar ahora mismo." />
            <TenantBadge label="trial" count={h.tenants.trialing} color="#2a2769"
              tip="En prueba gratuita todavía vigente." />
            <TenantBadge label="vencidos" count={h.tenants.expired} color="#dc2626"
              tip="Su plan o prueba caducó: la app los bloquea aunque la columna diga 'active'. Estos son los que hay que renovar." />
            <TenantBadge label="suspendidos" count={h.tenants.suspended} color="#d97706"
              tip="Bloqueados a mano por el operador." />
            <TenantBadge label="pago pendiente" count={h.tenants.past_due} color="#d97706"
              tip="Cobro fallido reportado por la pasarela." />
            <TenantBadge label="cancelados" count={h.tenants.canceled} color="#9ca3af"
              tip="Cuenta cancelada; las historias clínicas se conservan." />
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

// Values match the "¿Cómo nos conociste?" select on the public signup form.
const REFERRAL_LABELS: Record<string, string> = {
  recommendation: 'Recomendación de un colega',
  google:         'Búsqueda en Google',
  ai:             'IA (ChatGPT, Claude, Gemini…)',
  social:         'Redes sociales',
  other:          'Otro',
};

function TenantsTab() {
  const qc = useQueryClient();
  const { data: orgs, isLoading } = useQuery({ queryKey: ['admin-orgs'], queryFn: adminApi.listOrgs });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invalidate = () => { setBusyId(null); qc.invalidateQueries({ queryKey: ['admin-orgs'] }); };

  const activate    = useMutation({ mutationFn: ({ id, months, seats }: { id: string; months: number; seats: number }) => adminApi.activateOrg(id, months, seats), onSettled: invalidate });
  const suspend     = useMutation({ mutationFn: (id: string) => adminApi.suspendOrg(id), onSettled: invalidate });
  const cancel      = useMutation({ mutationFn: (id: string) => adminApi.cancelOrg(id), onSettled: invalidate });
  const extendTrial = useMutation({ mutationFn: ({ id, days }: { id: string; days: number }) => adminApi.extendTrial(id, days), onSettled: invalidate });
  const testFlag    = useMutation({ mutationFn: ({ id, isTest }: { id: string; isTest: boolean }) => adminApi.setOrgTestFlag(id, isTest), onSettled: invalidate });
  const deleteOrg   = useMutation({
    mutationFn: ({ id, confirmation }: { id: string; confirmation: string }) => adminApi.deleteOrg(id, confirmation),
    onSuccess: (res) => {
      const rows = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      alert(`Organización "${res.slug}" eliminada por completo (${rows} filas).`);
    },
    onError: (e: Error) => alert(e.message || 'No se pudo eliminar la organización.'),
    onSettled: invalidate,
  });

  const handleActivate = (o: AdminOrg) => {
    const input = window.prompt(`Activar "${o.name}" — ¿cuántos meses?`, '1');
    if (!input) return;
    const months = parseInt(input, 10);
    if (!Number.isInteger(months) || months < 1 || months > 36) { alert('Ingresa entre 1 y 36.'); return; }
    const seatsInput = window.prompt('¿Asientos de profesional? (vacío = sin cambio)', '');
    let seats = 0;
    if (seatsInput) {
      seats = parseInt(seatsInput, 10);
      if (!Number.isInteger(seats) || seats < 1 || seats > 100) { alert('Ingresa entre 1 y 100 (o deja vacío).'); return; }
    }
    setBusyId(o.id); activate.mutate({ id: o.id, months, seats });
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
  const handleToggleTest = (o: AdminOrg) => {
    const msg = o.is_test
      ? `¿Marcar "${o.name}" como organización REAL? Volverá a contar en métricas y quedará protegida: las organizaciones reales nunca se pueden eliminar.`
      : `¿Marcar "${o.name}" como organización de PRUEBA? Saldrá de las métricas y podrá eliminarse por completo. Hazlo solo si nunca fue un consultorio real.`;
    if (!window.confirm(msg)) return;
    setBusyId(o.id); testFlag.mutate({ id: o.id, isTest: !o.is_test });
  };
  const handleDelete = (o: AdminOrg) => {
    const typed = window.prompt(
      `ELIMINAR POR COMPLETO "${o.name}" — se borran usuarios, pacientes, historias, citas, facturas, llaves y audios. No hay forma de recuperar nada.\n\nEscribe el slug (${o.slug}) para confirmar:`,
    );
    if (typed === null) return;
    if (typed.trim() !== o.slug) { alert('El slug no coincide — no se eliminó nada.'); return; }
    setBusyId(o.id); deleteOrg.mutate({ id: o.id, confirmation: typed.trim() });
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
            // The badge follows the API's entitlement rule, not the raw column:
            // an 'active' org whose paid period lapsed is blocked, and saying
            // "Activo" here is how a locked-out clinic looks fine from admin.
            const acc = orgAccess(o);
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
                  {o.is_test && (
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#b45309', background: '#fef3c7',
                      border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>Prueba</span>
                  )}
                  <span style={{ fontWeight: 700, fontSize: 12, color: acc.color, background: acc.color + '18',
                    borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>{acc.label}</span>
                  {/* Traceability: when access and the stored column disagree,
                      show the column too — it's what the operator has to fix. */}
                  {acc.mismatch && (
                    <span title={`La columna subscription_status sigue en "${acc.rawStatus}", pero la API ya bloquea el acceso porque la fecha pasó.`}
                      style={{ fontSize: 11, fontWeight: 600, color: 'var(--s500)', background: 'var(--s100)',
                        border: '1px solid var(--s200)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                      BD: {acc.rawStatus}
                    </span>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--s500)', whiteSpace: 'nowrap' }}>
                    {o.total_users} {o.total_users === 1 ? 'usuario' : 'usuarios'}
                    <span style={{ marginLeft: 8 }}>{o.total_patients} {o.total_patients === 1 ? 'paciente' : 'pacientes'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--s400)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div>{fmtDate(acc.until)}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: acc.entitled ? 'var(--s400)' : acc.color }}>{acc.detail}</div>
                  </div>
                  <span style={{ fontSize: 16, color: 'var(--s300)', userSelect: 'none' }}>{expanded ? '▲' : '▼'}</span>
                </div>

                {/* Panel expandible de acciones */}
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--s100)', padding: '12px 16px', background: 'var(--s50)' }}>
                    {/* Estado de acceso: qué ve el cliente al entrar, y por qué */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: 'var(--s600)', marginBottom: 10 }}>
                      <span>{acc.entitled ? '🔓 Puede entrar' : '🔒 Bloqueado al entrar'} — {acc.detail}</span>
                      <span>Prueba: <strong>{fmtDate(o.trial_ends_at)}</strong></span>
                      <span>Plan pagado: <strong>{fmtDate(o.current_period_end)}</strong></span>
                      <span>Registro: <strong>{fmtDate(o.created_at)}</strong></span>
                    </div>
                    {acc.mismatch && (
                      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#7f1d1d', background: '#fef2f2',
                        border: '1px solid #fecaca', borderRadius: 10, padding: '8px 11px', marginBottom: 12 }}>
                        La columna <code>subscription_status</code> quedó en <strong>{acc.rawStatus}</strong>, pero la fecha de acceso ya pasó,
                        así que la API responde 402 y el usuario ve “tu período terminó”.
                        {o.current_period_end
                          ? ' Usa “Activar meses” para renovar: extender el trial no sirve mientras el plan pagado tenga fecha vencida.'
                          : ' Usa “Extender trial” o “Activar meses” para devolverle el acceso.'}
                      </div>
                    )}
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

                    <button style={btnStyle(o.is_test ? '#16a34a' : '#b45309')} disabled={busy} onClick={() => handleToggleTest(o)}>
                      {o.is_test ? '✔ Marcar como real' : '🧪 Marcar como prueba'}
                    </button>

                    {/* Real orgs are never deletable — clinical records carry
                        a legal retention obligation. The server enforces the
                        same rule; hiding the button just makes it honest. */}
                    {o.is_test && (
                      <button style={{ ...btnStyle('#7f1d1d'), marginLeft: 'auto' }} disabled={busy} onClick={() => handleDelete(o)}>
                        🗑 Eliminar por completo
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

// ── Activación tab ────────────────────────────────────────────────────────────

// Chapni se vende sin vendedor: alguien crea la cuenta en la web, tiene 14 días
// y nadie lo acompaña. Esta pestaña dice en qué paso se queda la gente, con
// hechos que ya están en la base de datos (ningún pixel, ninguna tabla nueva).

function fmtElapsed(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const PAID_SOURCE_LABEL: Record<string, string> = {
  charged:  'cobrado',
  checkout: 'suscrito, sin cobro aún',
  manual:   'activado a mano',
};

function ActivacionTab() {
  const { data, isLoading } = useQuery<ActivationMetrics>({
    queryKey: ['admin-activation'],
    queryFn: adminApi.activationMetrics,
  });

  if (isLoading) return <div style={{ fontSize: 14, color: 'var(--s400)' }}>Cargando…</div>;
  if (!data) return null;

  const stepLabel = (key: string) =>
    data.steps.find(s => s.key === key)?.label ?? 'Creó la cuenta';

  // Below the threshold each tenant is worth a huge slice of the bar, so the
  // percentages are arithmetic and not information. Saying it once, loudly,
  // beats drawing confident bars over a sample of one.
  const thin = data.cohort_total < data.min_readable_cohort;
  const paid = data.paid_breakdown;
  const onb = data.onboarding_breakdown;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ fontSize: 13, color: 'var(--s500)', lineHeight: 1.6, maxWidth: 620 }}>
        {data.cohort_total} {data.cohort_total === 1 ? 'consultorio real' : 'consultorios reales'} en
        la cohorte. Quedan fuera las organizaciones internas y las marcadas como prueba. Los pasos no
        están anidados: quien se salta la puesta en marcha y registra un paciente cuenta igual.
      </div>

      {thin && (
        <AlertBanner
          level="warning"
          message={
            data.cohort_total === 0
              ? 'Todavía no hay ningún consultorio real que medir.'
              : `Cohorte de ${data.cohort_total}: los porcentajes todavía no dicen nada.`
          }
          tip={
            data.cohort_total === 0
              ? 'El embudo se llena solo, con los registros que entren por la web. Marcar una organización como prueba la saca de aquí.'
              : `Con ${data.cohort_total} ${data.cohort_total === 1 ? 'consultorio' : 'consultorios'} cada uno vale ${Math.round(100 / data.cohort_total)} puntos, así que un 100% significa "los que hay llegaron", no "todo el mundo llega". Los tiempos tampoco son medianas todavía: son los tiempos de esos mismos consultorios. La lectura empieza a valer alrededor de ${data.min_readable_cohort} registros.`
          }
        />
      )}

      <MetricCard
        icon={<TrendingUp size={16} />}
        title="Embudo de activación"
        subtitle={thin
          ? 'Cuántos llegaron a cada paso y cuánto tardaron desde el registro'
          : 'Cuántos llegaron a cada paso y cuánto tardó la mediana desde el registro'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.steps.map(s => (
            <div key={s.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, color: 'var(--s600, var(--s500))' }}>{s.label}</span>
                <span style={{ fontSize: 12.5, color: 'var(--s500)' }}>
                  <b style={{ color: 'var(--s800)' }}>{s.orgs}</b>
                  {/* Con la cohorte pequeña el porcentaje se muestra apagado:
                      sigue estando para quien lo busque, sin pretender que mide. */}
                  <span style={{ color: thin ? 'var(--s300)' : 'var(--s500)' }}> · {Math.round(s.pct)}%</span>
                  <span style={{ marginLeft: 10, color: 'var(--s400)' }}>{fmtElapsed(s.median_hours)}</span>
                </span>
              </div>
              <div style={{ background: 'var(--s100)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(s.pct, 100)}%`, height: '100%',
                  background: s.key === 'paid' ? '#16a34a' : 'var(--teal)',
                  opacity: thin ? 0.45 : 1, transition: 'width .4s',
                }} />
              </div>
              {/* El último paso es el que más se presta a leerse de más: una
                  activación manual desde la consola no es una venta. */}
              {/* Cerrar el asistente y configurar el producto son dos cosas
                  distintas: el enlace "Omitir por ahora" marcaba el paso igual
                  que terminarlo, y el embudo lo contaba como puesta en marcha. */}
              {s.key === 'onboarded' && s.orgs > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 4 }}>
                  {onb.completed} {onb.completed === 1 ? 'la terminó' : 'la terminaron'}
                  {onb.skipped > 0 && ` · ${onb.skipped} le dio a "Omitir por ahora"`}
                  {onb.unknown > 0 && ` · ${onb.unknown} sin registrar (antes de medirlo)`}
                </div>
              )}
              {s.key === 'paid' && s.orgs > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--s400)', marginTop: 4 }}>
                  {paid.charged} con cobro real
                  {paid.checkout > 0 && ` · ${paid.checkout} suscrito sin cobro aún`}
                  {paid.manual > 0 && ` · ${paid.manual} activado a mano desde la consola`}
                </div>
              )}
            </div>
          ))}
        </div>
      </MetricCard>

      <MetricCard icon={<Users size={16} />} title="Consultorio por consultorio" subtitle="Dónde se detuvo cada uno y qué ha hecho dentro del sistema">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--s400)', fontSize: 11.5 }}>
                <th style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>Consultorio</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Se quedó en</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Pac.</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Citas</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Hist.</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>IA</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Último ingreso</th>
                <th style={{ padding: '6px 0 6px 8px', fontWeight: 600 }}>Origen</th>
              </tr>
            </thead>
            <tbody>
              {data.orgs.map(o => (
                <tr key={o.org_id} style={{ borderTop: '1px solid var(--s100)' }}>
                  <td style={{ padding: '8px 8px 8px 0' }}>
                    <div style={{ fontWeight: 600, color: 'var(--s800)' }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--s400)' }}>
                      se registró hace {daysAgo(o.created_at)} d · {o.subscription_status}
                    </div>
                  </td>
                  <td style={{
                    padding: '8px',
                    color: o.paid_source === 'charged' ? '#16a34a' : 'var(--s600, var(--s500))',
                    fontWeight: o.paid_source === 'charged' ? 700 : 400,
                  }}>
                    {stepLabel(o.furthest_step)}
                    {o.paid && o.paid_source !== 'charged' && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--s400)' }}>
                        {PAID_SOURCE_LABEL[o.paid_source]}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{o.total_patients}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{o.total_appointments}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{o.total_records}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{o.total_ai_drafts}</td>
                  <td style={{ padding: '8px', color: 'var(--s500)' }}>{fmtDate(o.last_login_at)}</td>
                  <td style={{ padding: '8px 0 8px 8px', color: 'var(--s400)' }}>{o.signup_source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.orgs.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--s400)', padding: '24px 0', fontSize: 14 }}>
              Todavía no se ha registrado ningún consultorio real.
            </div>
          )}
        </div>
      </MetricCard>
    </div>
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

  // Seed the editor whenever a (re)fetched document arrives — render-time
  // adjust instead of an effect, so there is no extra paint with stale text.
  const [seededDoc, setSeededDoc] = useState<LegalDoc | undefined>(undefined);
  if (data && data !== seededDoc) {
    setSeededDoc(data);
    setBody(data.body_md);
    setVersion(data.version);
  }

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

  // Seed the form from the (re)fetched config — render-time adjust, no effect.
  const [seededCfg, setSeededCfg] = useState<PlatformMPConfig | undefined>(undefined);
  if (cfg && cfg !== seededCfg) {
    setSeededCfg(cfg);
    setAmount(String(cfg.plan_amount));
    setReason(cfg.plan_reason);
    setEnforce(cfg.webhook_enforce);
  }

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
      // MercadoPago no cobra menos de esto, y por debajo el checkout falla con
      // un 400 que le llega al cliente como "no se pudo iniciar el pago". El
      // backend lo rechaza igual; esto es para que el operador se entere antes
      // de guardar y no cuando alguien intente pagar.
      if (n < MP_MIN_CHARGE_COP) {
        throw new Error(`MercadoPago no cobra menos de $${MP_MIN_CHARGE_COP.toLocaleString('es-CO')} COP`);
      }
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
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s500)', display: 'block', marginBottom: 4 }}>Precio mensual por profesional (COP)</label>
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

// ── Agenda comercial tab ──────────────────────────────────────────────────────

const LEAD_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Half-hour grid, plus '24:00' so a day can run to midnight (the backend
// special-cases it in toMinutes).
const HOUR_OPTIONS = (() => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  out.push('24:00');
  return out;
})();

function fmtSlot(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
  });
}

function AgendaTab() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({
    queryKey: ['admin', 'lead-agenda-settings'],
    queryFn: leadBookingAdminApi.getSettings,
  });
  const { data: booked } = useQuery({
    queryKey: ['admin', 'lead-bookings'],
    queryFn: leadBookingAdminApi.list,
  });

  // The form is the fetched settings until the user edits something; from then
  // on the draft wins, so a background refetch can't clobber edits in progress.
  const [draft, setDraft] = useState<LeadAgendaSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const form = draft ?? cfg ?? null;

  if (!form) {
    return <div style={{ fontSize: 13, color: 'var(--s500)' }}>Cargando…</div>;
  }

  const set = <K extends keyof LeadAgendaSettings>(k: K, v: LeadAgendaSettings[K]) => {
    setDraft({ ...form, [k]: v });
    setMsg(''); setErr('');
  };

  const toggleDay = (d: string) => {
    const on = form.active_days.includes(d);
    set('active_days', on ? form.active_days.filter(x => x !== d) : [...form.active_days, d]);
  };

  const save = async () => {
    if (form.active_days.length === 0) { setErr('Elige al menos un día'); return; }
    if (form.start_hour >= form.end_hour)  { setErr('La hora de fin debe ser posterior a la de inicio'); return; }
    setSaving(true); setErr(''); setMsg('');
    try {
      await leadBookingAdminApi.updateSettings(form);
      qc.invalidateQueries({ queryKey: ['admin', 'lead-agenda-settings'] });
      setMsg('Guardado');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7, border: '1.5px solid var(--s200)',
    fontSize: 13, color: 'var(--s800)', background: '#fff', minWidth: 110,
  };
  const cardStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid var(--s100)', borderRadius: 12, padding: 20,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12.5, fontWeight: 600, color: 'var(--s600)', marginBottom: 6, display: 'block',
  };

  const upcoming = (booked?.bookings ?? []).filter(b => b.status === 'BOOKED');

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <CalendarClock size={17} color="#5b52ad" />
          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--s800)' }}>Horario de la agenda comercial</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--s500)', margin: '0 0 18px' }}>
          Define cuándo se ofrecen llamadas en la página pública <strong>chapni.com/agenda</strong>. Los horarios
          ocupados en tu Google Calendar se descuentan automáticamente.
        </p>

        <label style={labelStyle}>Días de atención</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
          {LEAD_DAYS.map(d => {
            const on = form.active_days.includes(d);
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  border: on ? '1.5px solid #5b52ad' : '1.5px solid var(--s200)',
                  background: on ? '#5b52ad' : '#fff',
                  color: on ? '#fff' : 'var(--s500)',
                }}
              >
                {d}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
          <div>
            <label style={labelStyle}>Hora de inicio</label>
            <select value={form.start_hour} onChange={e => set('start_hour', e.target.value)} style={inputStyle}>
              {HOUR_OPTIONS.filter(h => h !== '24:00').map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Hora de fin</label>
            <select value={form.end_hour} onChange={e => set('end_hour', e.target.value)} style={inputStyle}>
              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Duración de la llamada</label>
            <select value={form.duration_min} onChange={e => set('duration_min', Number(e.target.value))} style={inputStyle}>
              {[15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Espaciado entre horarios</label>
            <select value={form.slot_step_min} onChange={e => set('slot_step_min', Number(e.target.value))} style={inputStyle}>
              {[15, 20, 30, 45, 60].map(n => <option key={n} value={n}>Cada {n} min</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Zona horaria</label>
            <select value={form.timezone} onChange={e => set('timezone', e.target.value)} style={inputStyle}>
              {['America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Lima',
                'America/Argentina/Buenos_Aires', 'Europe/Madrid'].map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {msg && <span style={{ fontSize: 12.5, color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={13} /> {msg}</span>}
          {err && <span style={{ fontSize: 12.5, color: '#dc2626' }}>{err}</span>}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Users size={17} color="#5b52ad" />
          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--s800)' }}>
            Llamadas agendadas {upcoming.length > 0 && `(${upcoming.length})`}
          </span>
        </div>
        {upcoming.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--s500)', margin: 0 }}>Todavía no hay llamadas agendadas.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {upcoming.map(b => (
              <div key={b.id} style={{ borderBottom: '1px solid var(--s100)', paddingBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>{b.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--s600)', marginTop: 2 }}>
                  {fmtSlot(b.scheduled_at)} · {b.duration_min} min
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 2 }}>
                  {b.email}{b.phone ? ` · ${b.phone}` : ''}
                </div>
                {b.message && (
                  <div style={{ fontSize: 12.5, color: 'var(--s600)', marginTop: 4, fontStyle: 'italic' }}>“{b.message}”</div>
                )}
                {b.meet_url && (
                  <a href={b.meet_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#5b52ad', fontWeight: 600 }}>
                    Enlace de Meet
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'sistema' | 'tenants' | 'activacion' | 'plataforma' | 'legal' | 'agenda';
const TAB_TITLES: Record<Tab, string> = {
  sistema:    'Sistema',
  tenants:    'Tenants',
  activacion: 'Activación',
  plataforma: 'Plataforma',
  legal:      'Legal',
  agenda:     'Agenda comercial',
};

export function SuperAdminPage() {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'sistema';
  const tab: Tab = (['sistema', 'tenants', 'activacion', 'plataforma', 'legal', 'agenda'] as Tab[]).includes(rawTab as Tab)
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
      {tab === 'activacion' && <ActivacionTab />}
      {tab === 'legal'      && <LegalTab />}
      {tab === 'plataforma' && <PlataformaTab />}
      {tab === 'agenda'     && <AgendaTab />}
    </div>
  );
}
