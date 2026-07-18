import { useState } from 'react';
import { ClipboardList, ChevronDown, ChevronRight } from 'lucide-react';
import { TASK_CHECKLIST_AREAS } from './constants';

interface Props {
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}

function toggle(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

// Task checklist — 6 areas with ~24 therapeutic techniques.
// Shared between EVOLUTION (Formato 3) and plan-session EVOLUTION (Formato 2),
// plus records/drafts pinned to archived template versions that still use the
// retired widget:task_checklist (new templates use a generic multiselect).
// Starts collapsed: it's a long, rarely-touched checklist most sessions don't
// need — the count badge stays visible so a filled-in checklist is never
// invisible, but the professional isn't forced to scroll past it every time.
export function TaskChecklist({ selected, onChange, disabled }: Props) {
  const count = selected.length;
  const [open, setOpen] = useState(false);
  // Values outside the fixed technique keys (e.g. free text an AI draft
  // extracted). They must stay visible: the badge counts them, so hiding
  // them would make the card look empty while claiming content.
  const knownKeys = new Set(TASK_CHECKLIST_AREAS.flatMap(a => a.tasks.map(t => t.key)));
  const customValues = selected.filter(v => !knownKeys.has(v));

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: open ? 4 : 0, cursor: 'pointer' }}
      >
        {open ? <ChevronDown size={14} color="var(--s400)" /> : <ChevronRight size={14} color="var(--s400)" />}
        <ClipboardList size={16} color="var(--teal)" />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
          Compromisos y tareas extra-consulta
          {count > 0 && (
            <span style={{
              marginLeft: 8, padding: '2px 8px', borderRadius: 12,
              background: 'var(--teal)', color: '#fff', fontSize: 11, fontWeight: 700,
            }}>{count}</span>
          )}
        </p>
      </div>
      {open && (
      <>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--s400)' }}>
        Marca las técnicas asignadas para casa. Las seleccionadas quedan en la historia clínica.
      </p>

      {customValues.length > 0 && (
        <div style={{ marginBottom: 12, borderRadius: 10, border: '1px solid var(--teal)', background: '#f0fafa', padding: '10px 12px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>
            Otras tareas (texto libre)
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customValues.map(item => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--s700)' }}>{item}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(selected.filter(v => v !== item))}
                    aria-label={`Quitar ${item}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TASK_CHECKLIST_AREAS.map(area => {
          const areaSelected = area.tasks.filter(t => selected.includes(t.key)).length;
          return (
            <div key={area.key} style={{ borderRadius: 10, border: `1px solid ${areaSelected > 0 ? 'var(--teal)' : 'var(--s100)'}`, background: areaSelected > 0 ? '#f0fafa' : '#fafafa', overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--s100)', background: areaSelected > 0 ? '#e0f7f7' : '#f3f4f6' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: areaSelected > 0 ? 'var(--teal)' : 'var(--s600)' }}>
                  {area.label}
                  {areaSelected > 0 && <span style={{ marginLeft: 6, fontSize: 11 }}>({areaSelected} seleccionada{areaSelected !== 1 ? 's' : ''})</span>}
                </span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {area.tasks.map(task => {
                  const isSelected = selected.includes(task.key);
                  return (
                    <label key={task.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox" checked={isSelected} disabled={disabled}
                        onChange={() => onChange(toggle(selected, task.key))}
                        style={{ marginTop: 2, accentColor: 'var(--teal)', cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
                      />
                      <span>
                        <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--s800)' : 'var(--s700)', display: 'block' }}>
                          {task.label}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--s400)', lineHeight: '1.4' }}>
                          {task.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
