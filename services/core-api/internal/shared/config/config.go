package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port        string
	Environment string
	LogLevel    slog.Level

	DatabaseURL string

	RedisAddr     string
	RedisPassword string

	MasterKey string

	JWTSecret         string
	JWTAccessTTLMin   int
	JWTRefreshTTLDays int

	AIServiceURL string
	AudioDir     string

	CORSAllowedOrigins []string

	ResendAPIKey string
	ResendFrom   string

	// AppBaseURL is the public origin of the SPA, used to build links sent to
	// patients (e.g. remote consent signature).
	AppBaseURL string

	// AllowDataReset enables the admin-only "wipe clinical test data" endpoint.
	// Off by default; turn on only while the clinic is in a testing phase.
	AllowDataReset bool

	// MercadoPago subscription billing (MT5b). When the access token is empty,
	// the billing endpoints respond 503 and tenants are activated manually.
	MPAccessToken string
	MPPlanAmount  int    // monthly price in the smallest COP unit the gateway expects (whole pesos)
	MPPlanReason  string // plan name shown on the MercadoPago checkout
}

func Load() Config {
	return Config{
		Port:        getEnv("PORT", "8080"),
		Environment: getEnv("ENVIRONMENT", "development"),
		LogLevel:    parseLogLevel(getEnv("LOG_LEVEL", "info")),

		DatabaseURL: mustGetEnv("DATABASE_URL"),

		RedisAddr:     getEnv("REDIS_HOST", "redis") + ":" + getEnv("REDIS_PORT", "6379"),
		RedisPassword: mustGetEnv("REDIS_PASSWORD"),

		MasterKey: mustGetEnv("MASTER_KEY"),

		JWTSecret:         mustGetEnv("JWT_SECRET"),
		JWTAccessTTLMin:   getEnvInt("JWT_ACCESS_TTL_MINUTES", 60),
		JWTRefreshTTLDays: getEnvInt("JWT_REFRESH_TTL_DAYS", 7),

		AIServiceURL: getEnv("AI_SERVICE_URL", "http://ai-service:8000"),
		AudioDir:     getEnv("AUDIO_DIR", "/data/audio"),

		CORSAllowedOrigins: getEnvSlice("CORS_ALLOWED_ORIGINS", []string{
			"http://localhost:5173",
			"http://localhost:5174",
			"http://localhost:80",
		}),

		ResendAPIKey: getEnv("RESEND_API_KEY", ""),
		ResendFrom:   getEnv("RESEND_FROM", ""),

		AppBaseURL: getEnv("APP_BASE_URL", "http://localhost:5173"),

		AllowDataReset: getEnvBool("ALLOW_DATA_RESET", false),

		MPAccessToken: getEnv("MP_ACCESS_TOKEN", ""),
		MPPlanAmount:  getEnvInt("MP_PLAN_AMOUNT", 79000),
		MPPlanReason:  getEnv("MP_PLAN_REASON", "SGHCP · Plan mensual"),
	}
}

func getEnvBool(key string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required environment variable not set", "key", key)
		os.Exit(1)
	}
	return v
}

func getEnvSlice(key string, fallback []string) []string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	var out []string
	for _, s := range strings.Split(v, ",") {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return fallback
	}
	return out
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func parseLogLevel(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
