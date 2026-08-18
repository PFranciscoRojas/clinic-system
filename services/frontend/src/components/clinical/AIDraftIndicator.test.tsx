import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const get = vi.fn();

vi.mock('@/api/aiDrafts', () => ({ aiDraftsApi: { list: () => list(), get: (id: string) => get(id) } }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', roles: ['PROFESSIONAL'] } }),
}));

import { AIDraftIndicator } from './AIDraftIndicator';

afterEach(() => { cleanup(); list.mockReset(); get.mockReset(); });

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AIDraftIndicator /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const generating = {
  id: 'd1', status: 'PROCESSING', patient_id: 'p1', patient_code: 1,
  created_at: new Date().toISOString(),
};

describe('AIDraftIndicator', () => {
  it('says how long the one recording in flight still needs', async () => {
    // The chip is what someone sees after walking away from the session, and
    // "generando" reads the same at forty seconds as at forty minutes.
    list.mockResolvedValue([generating]);
    get.mockResolvedValue({ ...generating, eta_seconds: 480 });
    draw();

    await waitFor(() => expect(screen.getByText('Borrador en unos 8 minutos')).toBeTruthy());
  });

  it('falls back to the plain wording when the server sends no estimate', async () => {
    // eta_seconds is absent whenever the queue could not be read. A chip that
    // waits for a number it is never getting would say nothing at all.
    list.mockResolvedValue([generating]);
    get.mockResolvedValue({ ...generating });
    draw();

    await waitFor(() => expect(screen.getByText('Generando borrador…')).toBeTruthy());
  });

  it('counts them instead of quoting one number for several recordings', async () => {
    // No single estimate is true for three drafts, and the chip sends you to
    // the list, where each one carries its own.
    list.mockResolvedValue([generating, { ...generating, id: 'd2' }, { ...generating, id: 'd3' }]);
    draw();

    await waitFor(() => expect(screen.getByText('Generando borrador (3)')).toBeTruthy());
    expect(get).not.toHaveBeenCalled();
  });

  it('renders nothing when no draft is in flight', async () => {
    list.mockResolvedValue([{ ...generating, status: 'DRAFT_READY' }]);
    const { container } = draw();

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(container.querySelector('button')).toBeNull();
  });
});
