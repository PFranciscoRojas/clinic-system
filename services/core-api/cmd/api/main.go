package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"sghcp/core-api/internal/shared/config"
)

func main() {
	cfg := config.Load()

	app, err := newApp(cfg)
	if err != nil {
		slog.Error("failed to initialize application", "err", err)
		os.Exit(1)
	}

	// NotifyContext cancels ctx when SIGINT or SIGTERM arrives (Ctrl+C / docker stop).
	// stop() releases the signal resources once shutdown is complete.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := app.run(ctx); err != nil {
		slog.Error("application stopped with error", "err", err)
		os.Exit(1)
	}
}
