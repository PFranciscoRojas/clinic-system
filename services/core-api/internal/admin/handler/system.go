package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"sghcp/core-api/internal/shared/httputil"
)

// ── structs ───────────────────────────────────────────────────────────────────

type diskStats struct {
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	FreeGB  float64 `json:"free_gb"`
	UsedPct float64 `json:"used_pct"`
}

type memStats struct {
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	FreeGB  float64 `json:"free_gb"`
	UsedPct float64 `json:"used_pct"`
}

type dbTableRow struct {
	Name   string  `json:"name"`
	SizeMB float64 `json:"size_mb"`
}

type dbStats struct {
	SizeMB      float64      `json:"size_mb"`
	TotalConns  int32        `json:"total_conns"`
	IdleConns   int32        `json:"idle_conns"`
	ActiveConns int32        `json:"active_conns"`
	TopTables   []dbTableRow `json:"top_tables"`
}

type redisStats struct {
	PingMs          float64 `json:"ping_ms"`
	UsedMemoryHuman string  `json:"used_memory_human"`
	Ok              bool    `json:"ok"`
}

type tenantCounts struct {
	Active        int `json:"active"`
	Trialing      int `json:"trialing"`
	PastDue       int `json:"past_due"`
	Canceled      int `json:"canceled"`
	TotalUsers    int `json:"total_users"`
	TotalPatients int `json:"total_patients"`
}

type aiQueueStats struct {
	Pending    int `json:"pending"`
	Processing int `json:"processing"`
	DraftReady int `json:"draft_ready"`
	Error      int `json:"error"`
}

type pgAdvanced struct {
	BufferHitPct   float64 `json:"buffer_hit_pct"`   // idealmente >99%
	Commits        int64   `json:"commits"`           // transacciones confirmadas desde último reset
	Rollbacks      int64   `json:"rollbacks"`         // transacciones revertidas
	Deadlocks      int64   `json:"deadlocks"`         // debería ser 0
	SlowQueries    int     `json:"slow_queries"`      // queries activas >5s ahora mismo
	ActiveLocks    int     `json:"active_locks"`      // locks en espera ahora mismo
	StatsAgeHours  float64 `json:"stats_age_hours"`   // horas desde último reset de stats
}

type backupStatus struct {
	LastOkAt  *time.Time `json:"last_ok_at"`
	SizeHuman string     `json:"size_human"`
	HoursAgo  float64    `json:"hours_ago"`
	Ok        bool       `json:"ok"`
}

type alertItem struct {
	Level   string `json:"level"`   // info | warning | critical
	Code    string `json:"code"`
	Message string `json:"message"`
	Tip     string `json:"tip"`
}

type systemHealthResponse struct {
	CPUPct      float64      `json:"cpu_pct"`
	Disk        diskStats    `json:"disk"`
	Mem         memStats     `json:"mem"`
	DB          dbStats      `json:"db"`
	PG          pgAdvanced   `json:"pg"`
	Redis       redisStats   `json:"redis"`
	Tenants     tenantCounts `json:"tenants"`
	AIQueue     aiQueueStats `json:"ai_queue"`
	Backup      backupStatus `json:"backup"`
	UptimeSec   int64        `json:"uptime_sec"`
	CollectedAt time.Time    `json:"collected_at"`
	Alerts      []alertItem  `json:"alerts"`
}

var reMemory = regexp.MustCompile(`used_memory_human:(\S+)`)

// ── health handler ─────────────────────────────────────────────────────────────

// GET /api/v1/admin/system/health — SYSTEM_ADMIN only.
func (h *Handler) systemHealth(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	out := systemHealthResponse{
		UptimeSec:   int64(time.Since(h.startedAt).Seconds()),
		CollectedAt: time.Now().UTC(),
	}

	// --- CPU (muestrea /proc/stat dos veces con 150ms de separación) ---
	out.CPUPct = sampleCPU()

	// --- Disco ---
	var fs syscall.Statfs_t
	if err := syscall.Statfs("/", &fs); err != nil {
		slog.Warn("system-health: statfs", "err", err)
	} else {
		total := float64(fs.Blocks) * float64(fs.Bsize)
		free := float64(fs.Bavail) * float64(fs.Bsize)
		used := total - free
		out.Disk = diskStats{
			TotalGB: round2(total / 1e9),
			UsedGB:  round2(used / 1e9),
			FreeGB:  round2(free / 1e9),
			UsedPct: round2(used / total * 100),
		}
	}

	// --- Memoria RAM ---
	var si syscall.Sysinfo_t
	if err := syscall.Sysinfo(&si); err == nil {
		unit := uint64(si.Unit)
		total := float64(si.Totalram * unit)
		free := float64((si.Freeram + si.Bufferram) * unit)
		used := total - free
		out.Mem = memStats{
			TotalGB: round2(total / 1e9),
			UsedGB:  round2(used / 1e9),
			FreeGB:  round2(free / 1e9),
			UsedPct: round2(used / total * 100),
		}
	}

	// --- DB pool ---
	stat := h.pool.Stat()
	out.DB.TotalConns = stat.TotalConns()
	out.DB.IdleConns = stat.IdleConns()
	out.DB.ActiveConns = stat.AcquiredConns()

	var sizeMB float64
	h.pool.QueryRow(ctx, `SELECT pg_database_size(current_database()) / 1048576.0`).Scan(&sizeMB) //nolint:errcheck
	out.DB.SizeMB = round2(sizeMB)

	rows, err := h.pool.Query(ctx, `
		SELECT relname, pg_relation_size(quote_ident(relname)) / 1048576.0
		FROM pg_stat_user_tables
		ORDER BY pg_relation_size(quote_ident(relname)) DESC
		LIMIT 5
	`)
	if err == nil {
		for rows.Next() {
			var t dbTableRow
			if rows.Scan(&t.Name, &t.SizeMB) == nil {
				t.SizeMB = round2(t.SizeMB)
				out.DB.TopTables = append(out.DB.TopTables, t)
			}
		}
		rows.Close()
	}

	// --- PostgreSQL avanzado ---
	var blksHit, blksRead, commits, rollbacks, deadlocks int64
	var statsReset *time.Time
	h.pool.QueryRow(ctx, `
		SELECT blks_hit, blks_read, xact_commit, xact_rollback, deadlocks, stats_reset
		FROM pg_stat_database WHERE datname = current_database()
	`).Scan(&blksHit, &blksRead, &commits, &rollbacks, &deadlocks, &statsReset) //nolint:errcheck

	var bufHit float64 = 100
	if total := blksHit + blksRead; total > 0 {
		bufHit = round2(float64(blksHit) / float64(total) * 100)
	}
	var statsAgeH float64
	if statsReset != nil {
		statsAgeH = round2(time.Since(*statsReset).Hours())
	}

	var slowQ int
	h.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM pg_stat_activity
		WHERE state = 'active' AND query_start < now() - interval '5 seconds'
		  AND query NOT LIKE '%pg_stat%'
	`).Scan(&slowQ) //nolint:errcheck

	var activeLocks int
	h.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM pg_locks WHERE NOT granted
	`).Scan(&activeLocks) //nolint:errcheck

	out.PG = pgAdvanced{
		BufferHitPct:  bufHit,
		Commits:       commits,
		Rollbacks:     rollbacks,
		Deadlocks:     deadlocks,
		SlowQueries:   slowQ,
		ActiveLocks:   activeLocks,
		StatsAgeHours: statsAgeH,
	}

	// --- Redis ---
	if h.rdb != nil {
		t0 := time.Now()
		pingErr := h.rdb.Ping(ctx).Err()
		out.Redis.PingMs = round2(float64(time.Since(t0).Microseconds()) / 1000)
		out.Redis.Ok = pingErr == nil
		if pingErr == nil {
			info, err := h.rdb.Info(ctx, "memory").Result()
			if err == nil {
				if m := reMemory.FindStringSubmatch(info); len(m) == 2 {
					out.Redis.UsedMemoryHuman = m[1]
				}
			}
		}
	}

	// --- Tenants ---
	tcRows, err := h.pool.Query(ctx, `
		SELECT subscription_status, COUNT(*) FROM organizations GROUP BY subscription_status
	`)
	if err == nil {
		for tcRows.Next() {
			var status string
			var count int
			if tcRows.Scan(&status, &count) == nil {
				switch status {
				case "active":
					out.Tenants.Active = count
				case "trialing":
					out.Tenants.Trialing = count
				case "past_due":
					out.Tenants.PastDue = count
				case "canceled":
					out.Tenants.Canceled = count
				}
			}
		}
		tcRows.Close()
	}
	h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&out.Tenants.TotalUsers)       //nolint:errcheck
	h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM patients`).Scan(&out.Tenants.TotalPatients) //nolint:errcheck

	// --- Cola IA ---
	qRows, err := h.pool.Query(ctx, `
		SELECT status::text, COUNT(*) FROM ai_drafts GROUP BY status
	`)
	if err == nil {
		for qRows.Next() {
			var status string
			var count int
			if qRows.Scan(&status, &count) == nil {
				switch status {
				case "PENDING":
					out.AIQueue.Pending = count
				case "PROCESSING":
					out.AIQueue.Processing = count
				case "DRAFT_READY":
					out.AIQueue.DraftReady = count
				case "ERROR":
					out.AIQueue.Error = count
				}
			}
		}
		qRows.Close()
	}

	// --- Backup ---
	out.Backup = readBackupStatus()

	// --- Alertas calculadas ---
	out.Alerts = computeAlerts(out)

	httputil.WriteJSON(w, http.StatusOK, out)
}

func computeAlerts(h systemHealthResponse) []alertItem {
	alerts := []alertItem{}

	// Disco
	switch {
	case h.Disk.UsedPct >= 90:
		alerts = append(alerts, alertItem{
			Level:   "critical",
			Code:    "disk_critical",
			Message: "Disco al límite — PostgreSQL puede crashear en cualquier momento",
			Tip:     "Ejecuta 'Limpiar cache de builds' ahora mismo desde la sección Mantenimiento.",
		})
	case h.Disk.UsedPct >= 80:
		alerts = append(alerts, alertItem{
			Level:   "warning",
			Code:    "disk_high",
			Message: "Disco al 80%+ — actúa antes de llegar al límite",
			Tip:     "Ejecuta 'Limpiar cache de builds' desde Mantenimiento para liberar espacio.",
		})
	case h.Disk.UsedPct >= 70:
		alerts = append(alerts, alertItem{
			Level:   "info",
			Code:    "disk_growing",
			Message: "Disco al 70% — está creciendo",
			Tip:     "Considera hacer limpieza preventiva desde Mantenimiento.",
		})
	}

	// Recomendación de upgrade
	if h.Disk.UsedPct >= 65 {
		alerts = append(alerts, alertItem{
			Level:   "info",
			Code:    "upgrade_disk",
			Message: "Considera upgrade a Hetzner CX31 (+€3/mes): disco 80 GB en lugar de 40 GB",
			Tip:     "Con el crecimiento actual, el upgrade da margen para 1–2 años más sin preocupaciones de disco.",
		})
	}

	// Redis
	if !h.Redis.Ok {
		alerts = append(alerts, alertItem{
			Level:   "critical",
			Code:    "redis_down",
			Message: "Redis no responde — los jobs de IA y sesiones están afectados",
			Tip:     "Revisa el contenedor sghcp_redis en el VPS.",
		})
	}

	// Cola IA
	if h.AIQueue.Error > 0 {
		alerts = append(alerts, alertItem{
			Level:   "warning",
			Code:    "ai_errors",
			Message: "Hay borradores IA con error que el profesional no puede ver",
			Tip:     "Revisa los logs del ai-service para identificar la causa.",
		})
	}
	if h.AIQueue.Processing > 8 {
		alerts = append(alerts, alertItem{
			Level:   "warning",
			Code:    "ai_congested",
			Message: "Cola IA congestionada — más de 8 borradores procesando simultáneamente",
			Tip:     "El ai-service puede estar lento o colgado. Revisa sus logs.",
		})
	}

	// PostgreSQL avanzado
	if h.PG.Deadlocks > 0 {
		alerts = append(alerts, alertItem{
			Level:   "warning",
			Code:    "pg_deadlocks",
			Message: "Se detectaron deadlocks en PostgreSQL — dos operaciones se bloquearon mutuamente",
			Tip:     "Revisa si hay transacciones largas o escrituras simultáneas sobre los mismos registros.",
		})
	}
	if h.PG.BufferHitPct < 95 && (h.PG.Commits+h.PG.Rollbacks) > 100 {
		alerts = append(alerts, alertItem{
			Level:   "warning",
			Code:    "pg_cache_low",
			Message: "Cache de BD bajo (hit ratio < 95%) — PostgreSQL está leyendo del disco con frecuencia",
			Tip:     "Considera aumentar shared_buffers en PostgreSQL o hacer upgrade de RAM.",
		})
	}
	if h.PG.SlowQueries > 0 {
		alerts = append(alerts, alertItem{
			Level:   "warning",
			Code:    "pg_slow",
			Message: "Hay queries lentas ejecutándose (>5s) — el sistema puede estar respondiendo lento",
			Tip:     "Revisa los logs de PostgreSQL para identificar qué query está tardando.",
		})
	}

	// Backup
	if !h.Backup.Ok {
		msg := "No se encontró registro de backup — puede que nunca se haya ejecutado"
		tip := "Verifica que el cron de backup corre a las 2am (crontab -l en el VPS) y que /var/lib/sghcp/last_backup_ok existe."
		if h.Backup.LastOkAt != nil {
			msg = fmt.Sprintf("El último backup exitoso fue hace %.0fh — cron posiblemente fallido", h.Backup.HoursAgo)
			tip = "Revisa /var/log/sghcp-backup.log en el VPS para ver el error."
		}
		alerts = append(alerts, alertItem{Level: "critical", Code: "backup_stale", Message: msg, Tip: tip})
	}

	// Tenants vencidos
	if h.Tenants.PastDue > 0 {
		alerts = append(alerts, alertItem{
			Level:   "info",
			Code:    "tenants_past_due",
			Message: "Hay organizaciones con pago vencido — revisa la pestaña Tenants",
			Tip:     "Puedes activarlas manualmente si pagaron por transferencia.",
		})
	}

	// RAM
	if h.Mem.UsedPct >= 85 {
		alerts = append(alerts, alertItem{
			Level:   "warning",
			Code:    "mem_high",
			Message: "Memoria RAM al 85%+ — el sistema puede volverse lento",
			Tip:     "Considera upgrade a CX31 (8 GB RAM vs 4 GB actuales).",
		})
	}

	return alerts
}

// ── actions handler ────────────────────────────────────────────────────────────

// safeActions es la lista blanca de comandos que el operador puede ejecutar
// desde la UI. Cada uno es destructivo solo de artefactos intermedios de Docker,
// nunca de datos de producción (volúmenes, contenedores corriendo, BD).
var safeActions = map[string]struct {
	args        []string
	description string
}{
	"builder_prune": {
		args:        []string{"docker", "builder", "prune", "-af"},
		description: "Elimina el cache de builds de Docker (principal causante del problema de disco).",
	},
	"image_prune": {
		args:        []string{"docker", "image", "prune", "-f"},
		description: "Elimina imágenes huérfanas (sin tag, no usadas por ningún contenedor).",
	},
	"system_prune": {
		args:        []string{"docker", "system", "prune", "-f"},
		description: "Elimina contenedores detenidos, redes sin uso e imágenes huérfanas. No toca volúmenes ni contenedores activos.",
	},
}

type actionRequest struct {
	Action string `json:"action"`
}

type actionResponse struct {
	Action      string `json:"action"`
	Description string `json:"description"`
	Output      string `json:"output"`
	Ok          bool   `json:"ok"`
	DurationMs  int64  `json:"duration_ms"`
}

// POST /api/v1/admin/system/actions — SYSTEM_ADMIN only.
// Ejecuta un comando de mantenimiento de la lista blanca.
func (h *Handler) systemAction(w http.ResponseWriter, r *http.Request) {
	var body actionRequest
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}

	action, ok := safeActions[body.Action]
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "unknown action — allowed: builder_prune, image_prune, system_prune")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()

	t0 := time.Now()
	out, err := exec.CommandContext(ctx, action.args[0], action.args[1:]...).CombinedOutput()
	elapsed := time.Since(t0).Milliseconds()

	resp := actionResponse{
		Action:      body.Action,
		Description: action.description,
		Output:      string(out),
		Ok:          err == nil,
		DurationMs:  elapsed,
	}
	if err != nil {
		slog.Error("system-action failed", "action", body.Action, "err", err, "output", string(out))
	} else {
		slog.Info("system-action ok", "action", body.Action, "duration_ms", elapsed)
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// ── CPU helpers ────────────────────────────────────────────────────────────────

type procStatSample struct{ total, idle uint64 }

func readProcStat() procStatSample {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return procStatSample{}
	}
	line := strings.SplitN(string(data), "\n", 2)[0] // primera línea: "cpu  ..."
	fields := strings.Fields(line)
	if len(fields) < 5 {
		return procStatSample{}
	}
	var vals [10]uint64
	for i, f := range fields[1:] {
		if i >= 10 {
			break
		}
		vals[i], _ = strconv.ParseUint(f, 10, 64)
	}
	idle := vals[3] + vals[4] // idle + iowait
	total := vals[0] + vals[1] + vals[2] + vals[3] + vals[4] + vals[5] + vals[6] + vals[7]
	return procStatSample{total: total, idle: idle}
}

func sampleCPU() float64 {
	s1 := readProcStat()
	time.Sleep(150 * time.Millisecond)
	s2 := readProcStat()
	dt := s2.total - s1.total
	if dt == 0 {
		return 0
	}
	return round2(float64(dt-(s2.idle-s1.idle)) / float64(dt) * 100)
}

// ── backup status helper ───────────────────────────────────────────────────────

// readBackupStatus lee /backup-status/last_backup_ok (montado desde el host
// /var/lib/sghcp). El script backup.sh escribe "epoch|size" al finalizar con
// éxito. Si el archivo no existe o tiene >26h → backup fallido.
func readBackupStatus() backupStatus {
	data, err := os.ReadFile("/backup-status/last_backup_ok")
	if err != nil {
		return backupStatus{Ok: false}
	}
	parts := strings.SplitN(strings.TrimSpace(string(data)), "|", 2)
	if len(parts) < 2 {
		return backupStatus{Ok: false}
	}
	epoch, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return backupStatus{Ok: false}
	}
	t := time.Unix(epoch, 0)
	hoursAgo := round2(time.Since(t).Hours())
	return backupStatus{
		LastOkAt:  &t,
		SizeHuman: parts[1],
		HoursAgo:  hoursAgo,
		Ok:        hoursAgo <= 26,
	}
}

// compile-time check that fmt is used (used in computeAlerts Sprintf)
var _ = fmt.Sprintf
