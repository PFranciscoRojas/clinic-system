package repository

import (
	"context"
	"time"
)

func (r *Repository) IncrementFailedAttempts(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = NOW() WHERE id = $1`,
		userID,
	)
	return err
}

func (r *Repository) LockUser(ctx context.Context, userID string, until time.Time) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET locked_until = $2, updated_at = NOW() WHERE id = $1`,
		userID, until,
	)
	return err
}

func (r *Repository) ClearFailedAttempts(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users
		SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, userID)
	return err
}
