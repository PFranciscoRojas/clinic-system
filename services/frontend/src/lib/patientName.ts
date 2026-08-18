// The name a professional recognises, for lists that only carry a patient id.
//
// A clinical list keyed by "HC-000002" asks the reader to remember which case
// that is, and two of them side by side are indistinguishable. The code stays
// as the second line: it is the number that appears in the record itself and
// the one they will quote to a colleague.
//
// Names live encrypted with a per-patient DEK, so no list endpoint carries
// them. Resolving them one id at a time is what the rest of the app already
// does (PendingNotesCard), and react-query shares the ['patient', id] cache
// across every caller, so a patient looked up on the dashboard is free here.

import type { Patient } from '@/api/patients';

/** Display name, or '' when the patient is not loaded (or not readable). */
export function patientName(p: Patient | undefined): string {
  if (!p) return '';
  return [p.first_name, p.paternal_last_name].filter(Boolean).join(' ').trim();
}

/** Shown while the lookup is in flight, so the row does not jump when it lands. */
export const NAME_LOADING = '···';
