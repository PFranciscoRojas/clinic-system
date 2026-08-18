import { describe, expect, it } from 'vitest';
import type { Patient } from '@/api/patients';
import { patientName } from './patientName';

const base = { id: 'p1', document_type_code: 'CC', document_number: '1' } as Patient;

describe('patientName', () => {
  it('joins the first name and the paternal surname', () => {
    expect(patientName({ ...base, first_name: 'Ana', paternal_last_name: 'Ruiz' })).toBe('Ana Ruiz');
  });

  it('is empty while the patient is still being fetched', () => {
    // The caller shows a placeholder for this, not the empty string: a row that
    // renders nothing and then a name jumps under the cursor mid-click.
    expect(patientName(undefined)).toBe('');
  });

  it('does not leave a dangling space when a surname is missing', () => {
    // paternal_last_name is required by the form but optional in older rows,
    // and 'Ana ' renders as a name with a typo in it.
    expect(patientName({ ...base, first_name: 'Ana', paternal_last_name: '' })).toBe('Ana');
  });
});
