package clinicalperm

import "testing"

// IsAssignedToPatient needs a live database with RLS applied and is covered in
// internal/integration/needtoknow_test.go. What is left here are the two role
// predicates, which gate access to the clinical history under the need-to-know
// principle (Res. 1995/1999 Art. 14) — so every "no" is asserted explicitly.

func TestHasClinicalRole(t *testing.T) {
	cases := []struct {
		name  string
		roles []string
		want  bool
	}{
		{"professional", []string{"PROFESSIONAL"}, true},
		{"intern", []string{"INTERN"}, true},
		{"professional among several", []string{"CLINIC_ADMIN", "PROFESSIONAL"}, true},
		{"intern among several", []string{"RECEPTIONIST", "INTERN"}, true},
		{"clinic admin alone is administrative, not clinical", []string{"CLINIC_ADMIN"}, false},
		{"receptionist", []string{"RECEPTIONIST"}, false},
		{"system admin is the SaaS operator, not a clinician", []string{"SYSTEM_ADMIN"}, false},
		{"no roles", nil, false},
		{"empty slice", []string{}, false},
		{"empty string role", []string{""}, false},
		// Comparison is exact: a role list arriving lowercased from a future
		// token format must fail closed rather than grant clinical access.
		{"lowercase professional", []string{"professional"}, false},
		{"mixed case intern", []string{"Intern"}, false},
		{"role with surrounding space", []string{" PROFESSIONAL"}, false},
		{"a longer role that merely starts the same", []string{"PROFESSIONAL_ASSISTANT"}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := HasClinicalRole(tc.roles); got != tc.want {
				t.Errorf("HasClinicalRole(%q) = %v, want %v", tc.roles, got, tc.want)
			}
		})
	}
}

func TestIsSysAdmin(t *testing.T) {
	cases := []struct {
		name  string
		roles []string
		want  bool
	}{
		{"system admin", []string{"SYSTEM_ADMIN"}, true},
		{"system admin among several", []string{"PROFESSIONAL", "SYSTEM_ADMIN"}, true},
		// The distinction the whole SaaS depends on: a customer's own admin is
		// not the operator, and must never reach cross-tenant surfaces.
		{"clinic admin is not the operator", []string{"CLINIC_ADMIN"}, false},
		{"professional", []string{"PROFESSIONAL"}, false},
		{"no roles", nil, false},
		{"empty slice", []string{}, false},
		{"lowercase", []string{"system_admin"}, false},
		{"with a trailing space", []string{"SYSTEM_ADMIN "}, false},
		{"a longer role that merely starts the same", []string{"SYSTEM_ADMINISTRATOR"}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsSysAdmin(tc.roles); got != tc.want {
				t.Errorf("IsSysAdmin(%q) = %v, want %v", tc.roles, got, tc.want)
			}
		})
	}
}
