package service

import (
	"context"
	"fmt"

	"sghcp/core-api/internal/aidrafts"
	"sghcp/core-api/internal/shared/crypto"
)

// DecryptDraftContent decrypts and returns the draft_content_enc JSON string for a DRAFT_READY draft.
// The AI worker stores it as {"record_type": ..., "sections": {...}, "suggested_icd10": ...}.
func (s *Service) DecryptDraftContent(ctx context.Context, orgID, draftID string) (*aidrafts.AIDraft, string, error) {
	draft, err := s.repo.FindByID(ctx, orgID, draftID)
	if err != nil {
		return nil, "", err
	}
	if draft.Status != "DRAFT_READY" {
		return nil, "", fmt.Errorf("%w: draft is not DRAFT_READY", aidrafts.ErrNotReady)
	}

	encKey, err := s.repo.FindEncKey(ctx, draft.DEKID)
	if err != nil {
		return nil, "", fmt.Errorf("load draft DEK: %w", err)
	}
	dek, err := s.km.DecryptDEK(encKey.KeySource, encKey.EncryptedDEK)
	if err != nil {
		return nil, "", fmt.Errorf("decrypt DEK: %w", err)
	}

	if len(draft.DraftContentEnc) == 0 {
		return draft, "", nil
	}
	content, err := crypto.Open(dek, draft.DraftContentEnc)
	if err != nil {
		return nil, "", fmt.Errorf("decrypt draft_content: %w", err)
	}
	return draft, string(content), nil
}

// DecryptForReview decrypts the draft content AND transcription for the review
// screen. Works for any draft that has been processed (DRAFT_READY or APPROVED)
// so an approved record still shows its content instead of falling back to a
// legacy layout. Returns ("", "") for drafts that never produced content.
func (s *Service) DecryptForReview(ctx context.Context, orgID, draftID string) (draft *aidrafts.AIDraft, content, transcription string, err error) {
	draft, err = s.repo.FindByID(ctx, orgID, draftID)
	if err != nil {
		return nil, "", "", err
	}
	if len(draft.DraftContentEnc) == 0 && len(draft.TranscriptionEnc) == 0 {
		return draft, "", "", nil
	}

	encKey, err := s.repo.FindEncKey(ctx, draft.DEKID)
	if err != nil {
		return nil, "", "", fmt.Errorf("load draft DEK: %w", err)
	}
	dek, err := s.km.DecryptDEK(encKey.KeySource, encKey.EncryptedDEK)
	if err != nil {
		return nil, "", "", fmt.Errorf("decrypt DEK: %w", err)
	}

	if len(draft.DraftContentEnc) > 0 {
		b, derr := crypto.Open(dek, draft.DraftContentEnc)
		if derr != nil {
			return nil, "", "", fmt.Errorf("decrypt draft_content: %w", derr)
		}
		content = string(b)
	}
	if len(draft.TranscriptionEnc) > 0 {
		b, derr := crypto.Open(dek, draft.TranscriptionEnc)
		if derr != nil {
			return nil, "", "", fmt.Errorf("decrypt transcription: %w", derr)
		}
		transcription = string(b)
	}
	return draft, content, transcription, nil
}

// ResolveDraft marks the draft as APPROVED and links it to the resulting clinical record.
func (s *Service) ResolveDraft(ctx context.Context, orgID, draftID, clinicalRecordID, resolvedBy string) error {
	return s.repo.Resolve(ctx, orgID, draftID, clinicalRecordID, resolvedBy)
}
