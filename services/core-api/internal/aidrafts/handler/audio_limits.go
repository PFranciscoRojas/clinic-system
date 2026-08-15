package handler

import "time"

// How much audio the box is willing to hold in memory at once.
//
// Both audio routes call ParseMultipartForm, whose argument is the slice of the
// body kept in RAM before the rest spools to a temp file. Nothing bounded how
// many of those could be in flight: the routes are outside RateLimit (which only
// covers the public endpoints) and the whole-body one is outside the router's
// timeout as well, so its slice stays resident for as long as the upload takes —
// up to audioUploadDeadline. Several sessions closing at the same minute is the
// ordinary case in a clinic, not an attack, and that was enough to grow without
// a ceiling on a 1915 MB VPS that also runs Postgres, Redis and Whisper.
//
// The budget below is that ceiling. It is deliberately a single number that the
// two limits are derived from, so raising one means visibly spending the other's
// room rather than quietly adding to the total.
const audioUploadMemoryBudget = 128 << 20 // 128 MB

// The whole-session upload: 32 MB resident each (see ParseMultipartForm in
// writer.go), so two of them. Two is not stingy — since the parts upload landed
// this route is the fallback, taken when the recorder could not stream during
// the session or when the server refused to assemble. Concurrent fallbacks are
// rare, and a refused one loses nothing: the caller still holds the recording in
// IndexedDB and the recovery banner offers it again.
const maxConcurrentWholeUploads = (audioUploadMemoryBudget / 2) / (32 << 20) // 2

// A part is at most maxPartSize (8 MB) and is held for about a second, so the
// same half of the budget buys four times the slots. Eight concurrent parts
// serves far more than eight concurrent sessions: each session sends one part a
// minute and each part occupies its slot for roughly a second.
const maxConcurrentPartUploads = (audioUploadMemoryBudget / 2) / maxPartSize // 8

// Two pools rather than one, because the two routes hold their slots for times
// that differ by three orders of magnitude. Sharing a pool would let two
// fallback uploads — fourteen minutes each, worst case — refuse every part of
// every session recording at that moment, which is precisely backwards: it would
// push those sessions onto the same expensive path that is doing the blocking.
const (
	// The whole-body upload holds its slot for as long as the body takes, so a
	// caller told to come back has to be told to come back later.
	wholeUploadRetryAfter = 60 * time.Second
	// A part clears in about a second; the recorder's own backoff is shorter
	// than this and this value is only the floor for a client that honours it.
	partUploadRetryAfter = 5 * time.Second
)

// Spanish, like ErrTooLarge in errors.go and unlike the rest of this package:
// the messages a professional can act on are the ones that reach a screen.
const busyMessage = "el servidor está recibiendo otras grabaciones; espera un momento y reintenta"
