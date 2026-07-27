package hash

import "testing"

// Throwaway: proves branch protection blocks a red PR. Deleted immediately.
func TestGateCanaryMustFail(t *testing.T) {
	t.Fatal("deliberate failure: verifying that required status checks block the merge")
}
