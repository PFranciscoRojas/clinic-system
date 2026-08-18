import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const listDrafts = vi.fn();
const getPatient = vi.fn();

vi.mock('@/api/aiDrafts', () => ({ aiDraftsApi: { list: () => listDrafts() } }));
vi.mock('@/api/clinicalRecords', () => ({ clinicalRecordsApi: { listAll: () => Promise.resolve([]) } }));
vi.mock('@/api/patients', () => ({ patientsApi: { get: (id: string) => getPatient(id) } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', roles: ['PROFESSIONAL'] } }) }));
vi.mock('@/pages/Dashboard/PendingNotesCard', () => ({
  PendingNotesList: () => null,
  usePendingNotes: () => ({ data: [] }),
}));

import { ClinicalPage } from './ClinicalPage';

afterEach(() => { cleanup(); listDrafts.mockReset(); getPatient.mockReset(); });

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ClinicalPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const at = new Date(2026, 7, 18, 14, 35);
const draft = {
  id: 'd1', status: 'DRAFT_READY', patient_id: 'p1', patient_code: 2,
  created_at: at.toISOString(),
};

describe('ClinicalPage — the drafts list', () => {
  it('names the patient instead of leaving the row as a code', async () => {
    // Two rows reading HC-000001 and HC-000002 ask the reader to remember
    // which case each number is, and side by side they are indistinguishable.
    listDrafts.mockResolvedValue([draft]);
    getPatient.mockResolvedValue({ id: 'p1', first_name: 'Ana', paternal_last_name: 'Ruiz' });
    draw();

    await waitFor(() => expect(screen.getByText('Ana Ruiz')).toBeTruthy());
  });

  it('keeps the code, which is the number that appears in the record itself', async () => {
    listDrafts.mockResolvedValue([draft]);
    getPatient.mockResolvedValue({ id: 'p1', first_name: 'Ana', paternal_last_name: 'Ruiz' });
    draw();

    await waitFor(() => expect(screen.getByText('HC-000002')).toBeTruthy());
  });

  it('shows the time, so two drafts from the same day are not the same row', async () => {
    listDrafts.mockResolvedValue([draft]);
    getPatient.mockResolvedValue({ id: 'p1', first_name: 'Ana', paternal_last_name: 'Ruiz' });
    draw();

    await waitFor(() => expect(screen.getByText(/\d{2}:\d{2}/)).toBeTruthy());
  });

  it('asks for each patient once, however many drafts they have', async () => {
    // The lookup is per row by necessity — names are encrypted per patient, so
    // no list endpoint carries them — but three sessions with the same patient
    // is one patient.
    listDrafts.mockResolvedValue([
      draft, { ...draft, id: 'd2' }, { ...draft, id: 'd3' },
    ]);
    getPatient.mockResolvedValue({ id: 'p1', first_name: 'Ana', paternal_last_name: 'Ruiz' });
    draw();

    await waitFor(() => expect(screen.getAllByText('Ana Ruiz').length).toBe(3));
    expect(getPatient).toHaveBeenCalledTimes(1);
  });

  it('still renders the row when the patient cannot be read', async () => {
    // A draft whose patient the professional lost access to must not blank the
    // list; the code is enough to reach the draft and see what happened.
    listDrafts.mockResolvedValue([draft]);
    getPatient.mockRejectedValue(new Error('403'));
    draw();

    await waitFor(() => expect(screen.getByText('HC-000002')).toBeTruthy());
    expect(screen.getByText('Revisar')).toBeTruthy();
  });
});
