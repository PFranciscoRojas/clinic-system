package invariants

import (
	"path/filepath"
	"regexp"
	"testing"
)

// MercadoPago's minimum charge is written down twice: in Go, where it is
// enforced, and in the operator console, where it stops a request that is
// already known to fail. Two copies of a number is a drift waiting to happen,
// and this one drifts silently in the direction that hurts — the console would
// keep accepting a price the API refuses, which is the exact failure of
// 2026-08-18 with the console's own guard reintroducing it.
//
// One copy would be better. There is no build step shared by Go and the bundle
// to carry it, so instead the two are pinned here.
func TestTheConsoleAndTheAPIAgreeOnMercadoPagosFloor(t *testing.T) {
	goFloor := goIntConst(t,
		filepath.Join(moduleRoot(), "internal", "billing", "mercadopago", "client.go"),
		"MinChargeCOP")
	tsFloor := tsIntConst(t,
		filepath.Join(moduleRoot(), "..", "frontend", "src", "pages", "Admin", "SuperAdminPage.tsx"),
		"MP_MIN_CHARGE_COP")

	if goFloor != tsFloor {
		t.Fatalf("the API refuses a plan under %s and the console under %s: "+
			"an amount between the two saves fine and then fails at checkout",
			goFloor, tsFloor)
	}
}

func goIntConst(t *testing.T, path, name string) string {
	t.Helper()
	re := regexp.MustCompile(`(?m)^\s*(?:const\s+)?` + name + `\s*=\s*(\d+)`)
	return matchOne(t, path, re)[1]
}

func tsIntConst(t *testing.T, path, name string) string {
	t.Helper()
	re := regexp.MustCompile(`(?m)^\s*const\s+` + name + `\s*(?::\s*number\s*)?=\s*(\d+)`)
	return matchOne(t, path, re)[1]
}
