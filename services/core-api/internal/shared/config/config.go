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

	// SearchPepper keys the HMAC-SHA256 search hashes over PII (email, last
	// name, document number). Independent from MASTER_KEY so either secret can
	// rotate without touching the other.
	SearchPepper string

	JWTSecret         string
	JWTAccessTTLMin   int
	JWTRefreshTTLDays int

	AIServiceURL string
	AudioDir     string

	// WindowTranscription enqueues a transcription job every few parts, so the
	// session is being transcribed while it is still being recorded (Fase 4 of
	// docs/ai/PLAN_LATENCIA_AUDIO.md). Off by default: it puts Whisper on the
	// CPU at the moment the professional is in the room, which is a change that
	// has to be turned on deliberately, on a box whose limits were measured.
	//
	// Off is never a degraded mode. /audio/complete transcribes the whole take
	// from scratch either way; this only decides how much of that work has
	// already happened by then.
	WindowTranscription bool

	CORSAllowedOrigins []string

	ResendAPIKey string
	ResendFrom   string

	// AppBaseURL is the public origin of the SPA, used to build links sent to
	// patients (e.g. remote consent signature).
	AppBaseURL string

	// SignupNotifyEmail receives an internal alert on every self-serve signup
	// and email verification (lead tracking). Empty disables the alerts.
	SignupNotifyEmail string
	// SupportWhatsApp is the intl support number (digits only, e.g. 573001234567)
	// used to build wa.me links in the welcome email. Empty hides the CTA.
	SupportWhatsApp string

	// MercadoPago subscription billing (MT5b). When the access token is empty,
	// the billing endpoints respond 503 and tenants are activated manually.
	MPAccessToken   string
	MPWebhookSecret string // signs MercadoPago webhook notifications (x-signature)
	// MPWebhookEnforce drops webhooks whose signature fails. Default true. May be
	// set false to fall back to the authoritative re-fetch (GetPayment with our
	// token) when the signing secret/manifest is being diagnosed.
	MPWebhookEnforce bool
	MPPlanAmount     int    // monthly price in the smallest COP unit the gateway expects (whole pesos)
	MPPlanReason     string // plan name shown on the MercadoPago checkout

	// BookingSessionPrice is the whole-COP price a patient pays per appointment
	// through the public booking page.
	BookingSessionPrice int

	// Google Calendar OAuth — optional. When empty, the integration is disabled.
	GoogleClientID     string
	GoogleClientSecret string

	// LeadsCalendarUserID is the user id whose connected Google Calendar backs
	// the public lead agenda (/agenda). Empty ⇒ the agenda still records the
	// booking but skips creating a calendar event.
	LeadsCalendarUserID string
}

func Load() Config {
	// Billing webhooks must be authenticated: if online payments are enabled
	// (an MP access token is set), the signing secret is mandatory. Otherwise the
	// public webhook would accept forged notifications (fail-closed, see
	// mercadopago.VerifyWebhook).
	mpAccessToken := getEnv("MP_ACCESS_TOKEN", "")
	mpWebhookSecret := getEnv("MP_WEBHOOK_SECRET", "")
	if mpAccessToken != "" && mpWebhookSecret == "" {
		slog.Error("MP_WEBHOOK_SECRET is required when MP_ACCESS_TOKEN is set (webhook signature verification)")
		os.Exit(1)
	}

	return Config{
		Port:        getEnv("PORT", "8080"),
		Environment: getEnv("ENVIRONMENT", "development"),
		LogLevel:    parseLogLevel(getEnv("LOG_LEVEL", "info")),

		DatabaseURL: mustGetEnv("DATABASE_URL"),

		RedisAddr:     getEnv("REDIS_HOST", "redis") + ":" + getEnv("REDIS_PORT", "6379"),
		RedisPassword: mustGetEnv("REDIS_PASSWORD"),

		MasterKey: mustGetEnv("MASTER_KEY"),

		SearchPepper: mustGetEnv("SEARCH_PEPPER"),

		JWTSecret:         mustGetEnv("JWT_SECRET"),
		JWTAccessTTLMin:   getEnvInt("JWT_ACCESS_TTL_MINUTES", 60),
		JWTRefreshTTLDays: getEnvInt("JWT_REFRESH_TTL_DAYS", 7),

		AIServiceURL:        getEnv("AI_SERVICE_URL", "http://ai-service:8000"),
		AudioDir:            getEnv("AUDIO_DIR", "/data/audio"),
		WindowTranscription: getEnvBool("AI_WINDOW_TRANSCRIPTION", false),

		CORSAllowedOrigins: getEnvSlice("CORS_ALLOWED_ORIGINS", []string{
			"http://localhost:5173",
			"http://localhost:5174",
			"http://localhost:80",
		}),

		ResendAPIKey: getEnv("RESEND_API_KEY", ""),
		ResendFrom:   getEnv("RESEND_FROM", ""),

		AppBaseURL: getEnv("APP_BASE_URL", "http://localhost:5173"),

		SignupNotifyEmail: getEnv("SIGNUP_NOTIFY_EMAIL", ""),
		SupportWhatsApp:   getEnv("SUPPORT_WHATSAPP", ""),

		MPAccessToken:    mpAccessToken,
		MPWebhookSecret:  mpWebhookSecret,
		MPWebhookEnforce: getEnvBool("MP_WEBHOOK_ENFORCE", true),
		MPPlanAmount:     getEnvInt("MP_PLAN_AMOUNT", 79000),
		MPPlanReason:     getEnv("MP_PLAN_REASON", "Chapni · Plan mensual"),

		BookingSessionPrice: getEnvInt("BOOKING_SESSION_PRICE", 180000),

		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),

		LeadsCalendarUserID: getEnv("LEADS_CALENDAR_USER_ID", ""),
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
