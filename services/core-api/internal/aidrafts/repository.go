package aidrafts

import "context"

type Repository interface {
	CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error)
	Create(ctx context.Context, p CreateParams) (string, error)
	FindByID(ctx context.Context, orgID, draftID string) (*AIDraft, error)
	FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error)
}
