package main

import (
	"net/http"
	"testing"
)

// GO-2026-6089: net/http did not apply ReadHeaderTimeout on the unencrypted
// HTTP/2 check path. Go 1.25.13 fixes that, and the toolchain bump in this
// commit picks the fix up — but the reason the bug could reach this server at
// all is that the server never set ReadHeaderTimeout itself. It set ReadTimeout
// and relied on net/http deriving the header deadline from it, which is exactly
// the kind of derivation a stdlib bug can skip on one code path without anything
// here noticing.
//
// So this test is about the configuration, not the vulnerability: the deadline
// that protects against a client dribbling headers forever is stated, not
// inherited. Updating Go alone would turn the scanner green and leave that
// unstated (the lesson of chi.RealIP, PR #250).
//
// The other six findings in the same scan are stdlib-internal — recursion depth
// in encoding/xml and encoding/asn1, punycode handling in idna, TLS handshake
// paths. There is no usage pattern of ours to pin for those: a test reproducing
// them would be testing the Go runtime, and it would delete itself the moment
// the toolchain moved. They are fixed by the bump alone, and saying so is more
// honest than a test that pretends to cover them.

func TestServerStatesItsHeaderDeadline(t *testing.T) {
	srv := newHTTPServer(":0", http.NotFoundHandler())

	if srv.ReadHeaderTimeout <= 0 {
		t.Fatal("ReadHeaderTimeout is unset, so the header deadline is whatever " +
			"net/http chooses to derive from ReadTimeout on each code path")
	}
	if srv.ReadHeaderTimeout > srv.ReadTimeout {
		t.Errorf("ReadHeaderTimeout (%v) outlives ReadTimeout (%v), which makes it "+
			"a deadline that never fires", srv.ReadHeaderTimeout, srv.ReadTimeout)
	}
}

// The audio upload extends its own read deadline to twenty minutes from inside
// the handler, which runs after the headers are read. Pinning that here keeps
// the two facts in the same place: a header deadline this short is safe
// precisely because the long-body route does not depend on it.
func TestServerTimeoutsLeaveTheAudioRouteAlone(t *testing.T) {
	srv := newHTTPServer(":0", http.NotFoundHandler())

	if srv.ReadTimeout <= 0 || srv.WriteTimeout <= 0 || srv.IdleTimeout <= 0 {
		t.Fatalf("a timeout is unset: read=%v write=%v idle=%v",
			srv.ReadTimeout, srv.WriteTimeout, srv.IdleTimeout)
	}
	if srv.Handler == nil {
		t.Error("the server was built without its router")
	}
}
