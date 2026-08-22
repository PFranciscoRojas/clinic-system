// Package redisstream holds the one thing every producer of a Redis stream in
// this system has to agree on: that the stream has a ceiling.
//
// A Redis stream does not empty itself when a worker acknowledges an entry.
// XACK only takes the entry off the consumer group's pending list; the entry
// stays in the stream for ever. So a queue that works perfectly grows without
// bound, and the growth is invisible while it is small — which is now: the
// three AI lanes held about 120 KB the day this was written, inside 1.58 MB of
// a Redis with appendonly on and no maxmemory at all (policy noeviction). That
// is precisely why it gets a ceiling today rather than the day it matters.
//
// Disk is the smaller of the two reasons. The entries of the suggestion lane
// carry patient_id and org_id in the clear, and a stream ID *is* a timestamp,
// so an untrimmed stream is a permanent unencrypted record of which patient had
// clinical activity and at what hour, living outside the encryption boundary
// the rest of the system is built around. They are UUIDs, so not PII under this
// project's definition — but they are clinical metadata with infinite
// retention, and a ceiling gives them a window.
package redisstream

// MaxLen is the ceiling handed to every XAdd, always with Approx.
//
// Ten thousand entries is roughly three years of the current rate and a couple
// of months of a busy one, which is the right shape: long enough that nothing
// operational is ever lost to trimming, short enough that the tail does not
// outlive any reason to keep it. Growth here scales with sessions rather than
// with customers — a recorded hour produces one window entry per window — so
// the number is deliberately generous.
//
// Approx (the `~` of MAXLEN) lets Redis drop whole macro nodes instead of
// counting entries one by one, which is what makes the trim amortised O(1)
// rather than a stall on the producer's path. The exact length is not something
// anything here depends on; the fact that it stops growing is.
const MaxLen = 10000
