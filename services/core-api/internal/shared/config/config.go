package config

import (
	"log/slog"
	"os"
	"strconv"
)

type Config struct {
	Port        string
	Environment string
	LogLevel    slog.Level

	DatabaseURL string

	RedisAddr     string
	RedisPassword string

	MasterKey string

	JWTSecret          string
	JWTAccessTTLMin    int
	JWTRefreshTTLDays  int

	AIServiceURL string
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
