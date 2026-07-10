import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TemplatedSectionsForm from './TemplatedSectionsForm';
import type { SectionDef } from '../../api/recordTemplates';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { permissions: [] } }),
}));

afterEach(cleanup);

function def(overrides: Partial<SectionDef>): SectionDef {
  return {
    key: 'k', label: 'Sección', required: false, collapsed: false, type: 'text',
    ...overrides,
  };
}

describe('TemplatedSectionsForm — {collapsed} sections', () => {
  it('renders a plain (non-widget) collapsed section behind an accordion', () => {
    const schema = [def({ key: 'notas', label: 'Notas opcionales', collapsed: true, hint: 'Detalle aquí' })];
    render(<TemplatedSectionsForm schema={schema} value={{}} onChange={vi.fn()} />);

    expect(screen.getByText('Notas opcionales')).toBeTruthy();
    // Hidden until expanded: the textarea (whose placeholder is the hint) isn't rendered.
    expect(screen.queryByPlaceholderText('Detalle aquí')).toBeNull();
  });

  it('expands a collapsed section on click to reveal its input', async () => {
    const user = userEvent.setup();
    const schema = [def({ key: 'notas', label: 'Notas opcionales', collapsed: true, hint: 'Detalle aquí' })];
    render(<TemplatedSectionsForm schema={schema} value={{}} onChange={vi.fn()} />);

    await user.click(screen.getByText('Notas opcionales'));
    expect(screen.getByPlaceholderText('Detalle aquí')).toBeTruthy();
  });

  it('does not collapse a non-tagged section', () => {
    const schema = [def({ key: 'motivo', label: 'Motivo de consulta', required: true, hint: 'Por qué vino' })];
    render(<TemplatedSectionsForm schema={schema} value={{}} onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText('Por qué vino')).toBeTruthy();
  });

  it('lets a collapsed widget section manage its own collapse (no double accordion)', () => {
    const schema = [def({ key: 'tareas', label: 'Tareas', type: 'widget', widget: 'task_checklist', collapsed: true })];
    render(<TemplatedSectionsForm schema={schema} value={{}} onChange={vi.fn()} />);

    // TaskChecklist renders its own title, unwrapped by a second accordion toggle.
    expect(screen.getByText('Compromisos y tareas extra-consulta')).toBeTruthy();
  });
});
