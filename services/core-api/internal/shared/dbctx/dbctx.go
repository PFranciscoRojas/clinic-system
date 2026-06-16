// Package dbctx lets repositories run their queries on a request-scoped
// connection instead of grabbing an arbitrary one from the pool. The tenant
// middleware pins a connection, sets the app.current_org GUC on it, and stores
// it here; repositories then resolve their querier from the context so that
// Postgres Row-Level Security policies see the right organization. When no
// tenant connection is in context (login, catalogs, background jobs) the
// repository's own pool is used as a transparent fallback.
package dbctx

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Querier is the subset of pgx behaviour shared by *pgxpool.Pool,
// *pgxpool.Conn and pgx.Tx, so a repository can hold a pool yet transparently
// run on a request-scoped connection or transaction.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Begin(ctx context.Context) (pgx.Tx, error)
}

type ctxKey struct{}

// WithQuerier returns a context carrying the request-scoped querier.
func WithQuerier(ctx context.Context, q Querier) context.Context {
	return context.WithValue(ctx, ctxKey{}, q)
}

// From returns the request-scoped querier if one was set, otherwise fallback.
func From(ctx context.Context, fallback Querier) Querier {
	if q, ok := ctx.Value(ctxKey{}).(Querier); ok && q != nil {
		return q
	}
	return fallback
}
