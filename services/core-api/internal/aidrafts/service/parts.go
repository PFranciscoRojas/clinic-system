package service

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"sghcp/core-api/internal/aidrafts"
)

// Uploading a session in parts while it is still being recorded.
//
// The bytes already exist in the browser from the first second — MediaRecorder
// hands over a chunk every few seconds and recordingStore keeps them — and all
// of it used to be held back until "Finalizar sesión". The professional then
// watched a progress bar move an hour of audio over a clinic uplink, after the
// hour they had already spent sitting there.
//
// Each part is a file of its own, not an append to a shared one. That is what
// buys the three properties this needs and an O_APPEND stream does not:
//
//   - a part that timed out and is retried overwrites itself, where an append
//     would splice those seconds into the session twice;
//   - parts may arrive out of order, or two at once on a slow uplink;
//   - nothing has to remember how far an upload got, so a core-api restart
//     mid-session costs nothing.
const (
	// partSuffix marks a chunk of an upload still in progress. Deliberately not
	// `.part`, which saveAudio already uses for the temp file of a whole-body
	// upload — the sweep below must never mistake one for the other.
	partSuffix = ".chunk"

	// MaxUploadBytes caps a whole assembled session, matching the single-shot
	// route's limit. Enforced across the parts rather than per part: per part it
	// means nothing, since a client can fill a disk with any number of requests
	// that are each comfortably under any per-part limit.
	MaxUploadBytes = 200 << 20

	// MaxParts bounds the index so it cannot be used to walk anywhere. At the
	// 60 s parts the recorder sends, this is 68 hours of session.
	MaxParts = 4096

	// abandonedPartAge is how long parts of an unfinished upload are kept. Long
	// enough that a professional who closes the laptop over lunch and comes back
	// still has their session; short enough that unencrypted PHI belonging to no
	// draft does not sit on the volume for days.
	abandonedPartAge = 12 * time.Hour
)

// uploadCap is MaxUploadBytes unless the service was built with a smaller one.
//
// It is a field rather than the constant read directly so that the test for the
// cap can reach it with a few kilobytes instead of proving the limit by actually
// writing 200 MB to disk on every `go test` and every CI runner. A test that
// costs that much is a test somebody eventually deletes.
func (s *Service) uploadCap() int64 {
	if s.maxUploadBytes > 0 {
		return s.maxUploadBytes
	}
	return MaxUploadBytes
}

type AppendPartInput struct {
	OrganizationID string
	AppointmentID  string
	// UploadID identifies one recording session. Minted by the browser, which
	// makes it the only part of this path an attacker controls outright.
	UploadID string
	Index    int
	Part     io.Reader
}

type AssemblePartsInput struct {
	OrganizationID string
	AppointmentID  string
	UploadID       string
	Ext            string
}

// AppendPart stores one part of an in-progress upload.
func (s *Service) AppendPart(in AppendPartInput) error {
	dir, err := s.uploadDir(in.OrganizationID, in.AppointmentID, in.UploadID)
	if err != nil {
		return err
	}
	if in.Index < 0 || in.Index >= MaxParts {
		return fmt.Errorf("%w: part index out of range", aidrafts.ErrInvalidInput)
	}
	if in.Part == nil {
		return fmt.Errorf("%w: part body is required", aidrafts.ErrInvalidInput)
	}

	limit := s.uploadCap()
	used, err := s.partBytes(dir, in.UploadID)
	if err != nil {
		return err
	}
	if used >= limit {
		return fmt.Errorf("%w: session recording exceeds %d bytes", aidrafts.ErrTooLarge, limit)
	}

	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create audio dir: %w", err)
	}

	dest := s.partPath(dir, in.UploadID, in.Index)
	tmp := dest + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("create audio part: %w", err)
	}

	// The remaining allowance, not the whole cap: a single part that overshoots
	// is refused at the point it would have written past the limit rather than
	// after the disk has taken it.
	n, err := io.Copy(f, io.LimitReader(in.Part, limit-used+1))
	if err == nil && used+n > limit {
		err = fmt.Errorf("%w: session recording exceeds %d bytes", aidrafts.ErrTooLarge, limit)
	}
	if err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("close audio part: %w", err)
	}

	// Renamed into place only once it is whole. A part left readable at its
	// final name half-written would be spliced into the session by the assembly
	// below, and the client — having seen the request fail — would send the same
	// seconds again on top of it.
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("finalize audio part: %w", err)
	}
	return nil
}

// materializeAudio produces the take on disk, whichever way the bytes arrived.
func (s *Service) materializeAudio(in UploadAudioInput) (string, error) {
	if in.UploadID == "" {
		path, err := s.saveAudio(in)
		if err != nil {
			return "", fmt.Errorf("save audio: %w", err)
		}
		return path, nil
	}
	path, err := s.assembleParts(AssemblePartsInput{
		OrganizationID: in.OrganizationID,
		AppointmentID:  in.AppointmentID,
		UploadID:       in.UploadID,
		Ext:            in.Ext,
	})
	if err != nil {
		return "", fmt.Errorf("assemble audio: %w", err)
	}
	return path, nil
}

// assembleParts concatenates the parts of one upload into a single take and
// removes them. Returns the path of the assembled file.
func (s *Service) assembleParts(in AssemblePartsInput) (string, error) {
	dir, err := s.uploadDir(in.OrganizationID, in.AppointmentID, in.UploadID)
	if err != nil {
		return "", err
	}
	if !audioExtRe.MatchString(in.Ext) {
		return "", fmt.Errorf("%w: unsupported audio extension", aidrafts.ErrInvalidInput)
	}

	parts, err := s.listParts(dir, in.UploadID)
	if err != nil {
		return "", err
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("%w: the upload has no parts", aidrafts.ErrInvalidInput)
	}

	// Contiguity from zero, and this is the property worth failing over. A hole
	// means minutes of the session are gone, and what comes out is a shorter
	// file that transcribes perfectly well: nothing downstream would ever
	// notice that the note describes a conversation with a piece missing.
	ordered := make([]string, len(parts))
	for i := range len(parts) {
		path, ok := parts[i]
		if !ok {
			return "", fmt.Errorf("%w: part %d of the upload never arrived", aidrafts.ErrInvalidInput, i)
		}
		ordered[i] = path
	}

	dest := filepath.Join(dir, uuid.NewString()+in.Ext)
	tmp := dest + ".part"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", fmt.Errorf("create audio file: %w", err)
	}
	for _, path := range ordered {
		part, err := os.Open(path) //nolint:gosec // path is built from validated uuids
		if err != nil {
			_ = out.Close()
			_ = os.Remove(tmp)
			return "", fmt.Errorf("read audio part: %w", err)
		}
		_, err = io.Copy(out, part)
		_ = part.Close()
		if err != nil {
			_ = out.Close()
			_ = os.Remove(tmp)
			return "", fmt.Errorf("assemble audio: %w", err)
		}
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("close audio file: %w", err)
	}
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		return "", fmt.Errorf("finalize audio file: %w", err)
	}

	// Only now: the parts are unencrypted PHI and after this point the assembled
	// take is the only copy anybody is tracking. Losing one to a failed delete
	// is not worth failing the upload over — the sweep gets it.
	for _, path := range ordered {
		_ = os.Remove(path)
	}
	return dest, nil
}

// SweepAbandonedParts deletes the parts of uploads nobody finished — the tab
// closed, the professional never pressed "Finalizar sesión". They are
// unencrypted PHI that no ai_draft row points at, so nothing else is ever going
// to come looking for them. Returns how many were removed.
func (s *Service) SweepAbandonedParts() (int, error) {
	cutoff := time.Now().Add(-abandonedPartAge)
	removed := 0
	err := filepath.WalkDir(s.audioDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			// A directory that vanished under the walk is an upload finishing,
			// not a reason to abandon the sweep.
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if d.IsDir() || !isPartFile(d.Name()) {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.ModTime().After(cutoff) {
			return nil //nolint:nilerr // a part still being written is not ours
		}
		if err := os.Remove(path); err == nil {
			removed++
		}
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return removed, fmt.Errorf("sweep audio parts: %w", err)
	}
	return removed, nil
}

// PartSweeper runs SweepAbandonedParts on a ticker, one goroutine inside
// core-api, mirroring the retention sweeper next to it.
type PartSweeper struct {
	svc    *Service
	logger *slog.Logger
}

func NewPartSweeper(audioDir string, logger *slog.Logger) *PartSweeper {
	return &PartSweeper{svc: &Service{audioDir: audioDir}, logger: logger}
}

// partSweepInterval is well under abandonedPartAge: the interval decides how
// long past the deadline something lingers, not how long it is kept.
const partSweepInterval = time.Hour

func (p *PartSweeper) Run(ctx context.Context) {
	p.logger.Info("audio part sweeper started", "interval", partSweepInterval, "keep_for", abandonedPartAge)
	ticker := time.NewTicker(partSweepInterval)
	defer ticker.Stop()
	p.sweep()
	for {
		select {
		case <-ctx.Done():
			p.logger.Info("audio part sweeper stopped")
			return
		case <-ticker.C:
			p.sweep()
		}
	}
}

func (p *PartSweeper) sweep() {
	removed, err := p.svc.SweepAbandonedParts()
	if err != nil {
		p.logger.Error("audio part sweep failed", "err", err)
	}
	if removed > 0 {
		p.logger.Info("deleted parts of unfinished uploads", "count", removed)
	}
}

func isPartFile(name string) bool {
	return strings.HasSuffix(name, partSuffix) || strings.HasSuffix(name, partSuffix+".tmp")
}

// uploadDir validates the three ids that reach the filesystem and returns the
// directory the upload lives in. All three are uuids; anything else is refused
// rather than cleaned, because there is no legitimate caller that would send
// one and no safe way to guess what was meant.
func (s *Service) uploadDir(orgID, apptID, uploadID string) (string, error) {
	for _, id := range []string{orgID, apptID, uploadID} {
		if _, err := uuid.Parse(id); err != nil {
			return "", fmt.Errorf("%w: organization, appointment and upload ids must be uuids", aidrafts.ErrInvalidInput)
		}
	}
	return filepath.Join(s.audioDir, orgID, apptID), nil
}

func (s *Service) partPath(dir, uploadID string, index int) string {
	return filepath.Join(dir, fmt.Sprintf("%s.%d%s", uploadID, index, partSuffix))
}

// listParts maps part index to path for one upload.
func (s *Service) listParts(dir, uploadID string) (map[int]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read audio dir: %w", err)
	}
	prefix := uploadID + "."
	parts := make(map[int]string, len(entries))
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, partSuffix) {
			continue
		}
		index, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(name, prefix), partSuffix))
		if err != nil || index < 0 || index >= MaxParts {
			continue
		}
		parts[index] = filepath.Join(dir, name)
	}
	return parts, nil
}

// partBytes is how much of the cap this upload has already used.
//
// Two parts arriving at the same moment can both read this before either has
// written, so the total may overshoot by one part. That is deliberate: the cap
// is a guard against filling a disk, not a security boundary, and paying for a
// lock on every part to make it exact would buy nothing.
func (s *Service) partBytes(dir, uploadID string) (int64, error) {
	parts, err := s.listParts(dir, uploadID)
	if err != nil {
		return 0, err
	}
	var total int64
	for _, path := range parts {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		total += info.Size()
	}
	return total, nil
}
