import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/test/memoryStorage';
import { RecordForm } from './RecordForm';

/* These tests cover the restore/autosave paths where the session 22–24
 * content-loss bugs lived: the localStorage net, the server-draft fallback on
 * a fresh device, their precedence, and the blocked-format recovery flow. */

const getMock = vi.fn();
vi.mock('@/api/clinicalRecords', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/api/clinicalRecords')>();
  return {
    ...orig,
    clinicalRecordsApi: {
      ...orig.clinicalRecordsApi,
      get: (...args: unknown[]) => getMock(...args),
      autosaveCreate: vi.fn(async () => ({ id: 'sd-new' })),
      autosaveUpdate: vi.fn(async () => undefined),
    },
  };
});
vi.mock('@/api/recordTemplates', () => ({
  recordTemplatesApi: { list: vi.fn(async () => []) },
}));

const STORAGE_KEY = 'clinical-draft-appt1';

function savedEvolutionDraft(text: string): string {
  return JSON.stringify({
    uiType: 'EVOLUTION',
    draft: { sections: { session_development: text } },
    customSections: {},
    selectedTemplateId: '',
  });
}

function renderForm(props: Partial<Parameters<typeof RecordForm>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecordForm
        patientId="p1"
        appointmentId="appt1"
        defaultType="EVOLUTION"
        hasOpenProcess
        treatmentConsentSigned
        onSaved={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  getMock.mockReset();
});

afterEach(() => {
  cleanup(); // without globals:true, RTL's automatic afterEach cleanup never registers
  vi.unstubAllGlobals();
});

describe('RecordForm restore', () => {
  it('restores a local draft and says so', async () => {
    localStorage.setItem(STORAGE_KEY, savedEvolutionDraft('trabajo de la sesión anterior'));

    renderForm();

    expect(await screen.findByText('Borrador restaurado automáticamente.')).toBeTruthy();
    expect(screen.getByDisplayValue('trabajo de la sesión anterior')).toBeTruthy();
  });

  it('falls back to the server draft when localStorage is empty', async () => {
    getMock.mockResolvedValue({
      id: 'sd9',
      record_type: 'EVOLUTION',
      sections: { session_development: 'contenido rescatado del servidor' },
      risk_level: null,
    });

    renderForm({ existingDraftId: 'sd9' });

    expect(await screen.findByDisplayValue('contenido rescatado del servidor')).toBeTruthy();
    expect(getMock).toHaveBeenCalledWith('sd9');
    expect((await screen.findAllByText('Borrador restaurado automáticamente.')).length).toBeGreaterThan(0);
  });

  it('a local draft wins: the server draft is never fetched', async () => {
    localStorage.setItem(STORAGE_KEY, savedEvolutionDraft('lo local manda'));

    renderForm({ existingDraftId: 'sd9' });

    expect(await screen.findByDisplayValue('lo local manda')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50)); // let effect 2 (server fallback) get its chance
    expect(getMock).not.toHaveBeenCalled();
  });

  it('a saved format that no longer fits the process is quarantined, not lost', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      uiType: 'INITIAL', // hasOpenProcess=true only allows PLAN/EVOLUTION/DISCHARGE
      draft: { sections: { consultation_reason: 'motivo escrito antes de abrir el proceso' } },
      customSections: {},
      selectedTemplateId: '',
    }));

    renderForm({ existingDraftId: 'sd9' });

    // Not silently loaded, not silently discarded — and no server overwrite either.
    expect(await screen.findByText(/Tenías contenido sin guardar/)).toBeTruthy();
    expect(screen.queryByDisplayValue('motivo escrito antes de abrir el proceso')).toBeNull();
    expect(getMock).not.toHaveBeenCalled();

    // The professional can inspect the quarantined content read-only.
    await userEvent.click(screen.getByRole('button', { name: 'Ver contenido' }));
    expect(await screen.findByDisplayValue('motivo escrito antes de abrir el proceso')).toBeTruthy();
  });
});

describe('RecordForm autosave', () => {
  it('persists typed content to localStorage after the debounce', async () => {
    renderForm();

    const field = await screen.findByPlaceholderText(/Cómo llega el paciente/i);
    await userEvent.type(field, 'avance notable');

    await waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).draft.sections.session_development).toBe('avance notable');
    }, { timeout: 3_000 });
  });

  it('a corrupt saved draft starts clean instead of crashing', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json at all');

    renderForm();

    expect((await screen.findAllByText('Guardar registro clínico')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Borrador restaurado automáticamente.')).toBeNull();
  });
});
