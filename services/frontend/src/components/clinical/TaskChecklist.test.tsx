import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskChecklist } from './TaskChecklist';

afterEach(cleanup);

describe('TaskChecklist', () => {
  it('starts collapsed — the technique areas are not rendered until expanded', () => {
    render(<TaskChecklist selected={[]} onChange={vi.fn()} />);

    expect(screen.getByText('Compromisos y tareas extra-consulta')).toBeTruthy();
    expect(screen.queryByText('Autorregistro ABC')).toBeNull();
  });

  it('shows the selected count badge even while collapsed', () => {
    render(<TaskChecklist selected={['autorregistro_abc']} onChange={vi.fn()} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('expands to reveal the techniques on click, and collapses again', async () => {
    const user = userEvent.setup();
    render(<TaskChecklist selected={[]} onChange={vi.fn()} />);

    await user.click(screen.getByText('Compromisos y tareas extra-consulta'));
    expect(screen.getByText('Autorregistro ABC')).toBeTruthy();

    await user.click(screen.getByText('Compromisos y tareas extra-consulta'));
    expect(screen.queryByText('Autorregistro ABC')).toBeNull();
  });
});
