// Package buildinfo carries what this binary is, so the running system can be
// asked instead of assumed.
//
// Until 2026-08-20 there was no way to tell which build was serving. The image
// was tagged `latest` and nothing else, so "is the fix deployed?" was answered
// by reading a workflow log and trusting that nothing had happened since. With
// two colours in front of Caddy that guess gets worse: `latest` may be running
// in one of them and something older in the other.
//
// Version is set at link time (-X) and deliberately not read from the
// environment. An env var describes what somebody meant to deploy; the linker
// symbol describes what was actually compiled into the binary that is answering
// the request, which is the only version worth showing to an operator.
package buildinfo

import "os"

// Version is the git SHA this binary was built from, injected by the Dockerfile
// via -ldflags. "dev" means a local build that never went through CI.
var Version = "dev"

// Colour reports which half of the blue/green pair this process is, as told by
// the container's own environment. Unlike Version this one is configuration,
// because a colour is a fact about where the binary was placed, not about how
// it was built: the same image runs as blue on Monday and green on Tuesday.
func Colour() string {
	if c := os.Getenv("CORE_API_COLOUR"); c != "" {
		return c
	}
	return "unknown"
}

// Short trims the SHA to the first seven characters, the length git itself uses
// when it prints one. Returns the value untouched when it is not a full SHA, so
// "dev" stays "dev" instead of becoming "dev" with nothing to say.
func Short(v string) string {
	if len(v) < 7 {
		return v
	}
	return v[:7]
}
