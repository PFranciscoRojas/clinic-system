package invoicing

import (
	"context"
	"fmt"
)

// EncKeyRow is the encrypted DEK row fetched for decryption.
type EncKeyRow struct {
	ID           string
	EncryptedDEK []byte
	KeySource    string
}

// CreateEncKey stores a freshly generated, master-key-wrapped DEK and returns
// its id. Each invoice owns its own DEK (the schema requires dek_id), so its
// notes and payment references are sealed independently — same pattern as
// clinical records and treatment plans.
func (r *Repository) CreateEncKey(ctx context.Context, encryptedDEK []byte, keySource string) (string, error) {
	var id string
	err := r.q(ctx).QueryRow(ctx, `
		INSERT INTO encryption_keys (encrypted_dek, key_source, algorithm)
		VALUES ($1, $2, 'AES-256-GCM') RETURNING id
	`, encryptedDEK, keySource).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert encryption_key: %w", err)
	}
	return id, nil
}

func (r *Repository) FindEncKey(ctx context.Context, dekID string) (*EncKeyRow, error) {
	var k EncKeyRow
	err := r.q(ctx).QueryRow(ctx, `
		SELECT id, encrypted_dek, key_source FROM encryption_keys WHERE id = $1
	`, dekID).Scan(&k.ID, &k.EncryptedDEK, &k.KeySource)
	if err != nil {
		return nil, fmt.Errorf("find encryption_key: %w", err)
	}
	return &k, nil
}
