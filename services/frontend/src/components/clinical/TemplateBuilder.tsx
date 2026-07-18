/**
 * TemplateBuilder — visual editor for clinical record templates.
 *
 * Edits BuilderSection[] (see lib/templateMarkdown.ts) as a list of field
 * cards: label, hint, per-type controls (options chips, scale bounds) and
 * toggles. The parent (RecordTemplatesSection's TemplateEditor) owns the
 * state, serializes it to markdown on save and keeps the "advanced" raw
 * markdown mode in sync.
 *
 * Styling follows the app convention: inline styles over global.css vars.
 */

import { useState } from 'react';
import {
  ArrowUp, ArrowDown, Trash2, Plus, Type, List, ListChecks,
  SlidersHorizontal, CheckSquare, Brain, ShieldAlert, Target,
  Stethoscope, AlertTriangle, type LucideIcon,
} from 'lucide-react';
import type { FieldType } from '../../api/recordTemplates';
import {
  BuilderSection, FIELD_TYPE_META, WIDGET_META, KNOWN_WIDGETS,
  newBuilderSection, sectionError, duplicateLabelIds,
} from '../../lib/templateMarkdown';

const TYPE_ICONS: Record<string, LucideIcon> = {
  text: Type,
  select: List,
  multiselect: ListChecks,
  scale: SlidersHorizontal,
  checklist: CheckSquare,
  'widget:mental_exam': Brain,
  'widget:risk': ShieldAlert,
  'widget:treatment_plan': Target,
  'widget:diagnoses': Stethoscope,
};

const B = {
  card: {
    border: '1px solid var(--s200)',
    borderRadius: 10,
    background: '#fff',
    padding: '12px 14px',
  } as React.CSSProperties,
  cardError: {
    border: '1px solid #fca5a5',
  } as React.CSSProperties,
  input: {
    width: '100%',
    height: 36,
    border: '1px solid var(--s200)',
    borderRadius: 8,
    padding: '0 10px',
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    background: '#fff',
    color: 'var(--s800)',
    outline: 'none',
  } as React.CSSProperties,
  smallBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--s400)',
    padding: 0,
  } as React.CSSProperties,
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--s600)',
    cursor: 'pointer',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  typeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--teal-dark)',
    background: 'var(--teal-l)',
    border: '1px solid var(--teal-100)',
    borderRadius: 99,
    padding: '2px 9px',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  } as React.CSSProperties,
  errorText: {
    margin: '8px 0 0',
    fontSize: 12,
    color: 'var(--red)',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  } as React.CSSProperties,
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 12px',
    border: '1px dashed var(--s200)',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    color: 'var(--s700)',
    textAlign: 'left' as const,
    width: '100%',
  } as React.CSSProperties,
};

interface Props {
  sections: BuilderSection[];
  onChange: (sections: BuilderSection[]) => void;
}

export default function TemplateBuilder({ sections, onChange }: Props) {
  const [picking, setPicking] = useState(sections.length === 0);
  const dupIds = duplicateLabelIds(sections);

  const patch = (id: string, p: Partial<BuilderSection>) =>
    onChange(sections.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = (s: BuilderSection) => {
    const hasContent = s.label.trim() && s.type !== 'widget';
    if (hasContent && !confirm(`¿Eliminar el campo "${s.label}"?`)) return;
    onChange(sections.filter((x) => x.id !== s.id));
  };

  const add = (type: FieldType, widget?: string) => {
    onChange([...sections, newBuilderSection(type, widget)]);
    setPicking(false);
  };

  const usedWidgets = new Set(sections.filter((s) => s.type === 'widget').map((s) => s.widget));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sections.map((s, i) => (
        <FieldCard
          key={s.id}
          section={s}
          index={i}
          total={sections.length}
          duplicate={dupIds.has(s.id)}
          onPatch={(p) => patch(s.id, p)}
          onMove={(dir) => move(i, dir)}
          onRemove={() => remove(s)}
        />
      ))}

      {picking ? (
        <FieldPicker usedWidgets={usedWidgets} onPick={add} onCancel={sections.length > 0 ? () => setPicking(false) : undefined} />
      ) : (
        <button type="button" onClick={() => setPicking(true)} style={{ ...B.addBtn, justifyContent: 'center', color: 'var(--teal-dark)', fontWeight: 600 }}>
          <Plus size={15} /> Añadir campo
        </button>
      )}
    </div>
  );
}

// ── Field picker ─────────────────────────────────────────────────────────────

function FieldPicker({
  usedWidgets,
  onPick,
  onCancel,
}: {
  usedWidgets: Set<string | undefined>;
  onPick: (type: FieldType, widget?: string) => void;
  onCancel?: () => void;
}) {
  return (
    <div style={{ ...B.card, background: 'var(--s50)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          ¿Qué tipo de campo quieres agregar?
        </p>
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="Cancelar" style={{ ...B.smallBtn, fontSize: 13 }}>✕</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
        {(Object.keys(FIELD_TYPE_META) as (keyof typeof FIELD_TYPE_META)[]).map((t) => {
          const Icon = TYPE_ICONS[t] ?? Type;
          return (
            <button key={t} type="button" onClick={() => onPick(t)} style={B.addBtn}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--teal)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--s200)'; }}
            >
              <Icon size={16} color="var(--teal)" />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{FIELD_TYPE_META[t].label}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--s400)' }}>{FIELD_TYPE_META[t].description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p style={{ margin: '12px 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Bloques clínicos integrados
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
        {KNOWN_WIDGETS.map((w) => {
          const Icon = TYPE_ICONS[`widget:${w}`] ?? Type;
          const used = usedWidgets.has(w);
          return (
            <button key={w} type="button" disabled={used} onClick={() => onPick('widget', w)}
              style={{ ...B.addBtn, opacity: used ? 0.45 : 1, cursor: used ? 'not-allowed' : 'pointer' }}
              onMouseEnter={(e) => { if (!used) e.currentTarget.style.borderColor = 'var(--teal)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--s200)'; }}
              title={used ? 'Este bloque ya está en la plantilla' : undefined}
            >
              <Icon size={16} color="var(--teal)" />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{WIDGET_META[w].label}{used ? ' · ya agregado' : ''}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--s400)' }}>{WIDGET_META[w].description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── One field card ───────────────────────────────────────────────────────────

function FieldCard({
  section: s,
  index,
  total,
  duplicate,
  onPatch,
  onMove,
  onRemove,
}: {
  section: BuilderSection;
  index: number;
  total: number;
  duplicate: boolean;
  onPatch: (p: Partial<BuilderSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const error = sectionError(s) ?? (duplicate ? 'Hay otro campo con este mismo nombre: cámbiale el nombre a uno de los dos.' : null);
  const isWidget = s.type === 'widget';
  const typeLabel = isWidget
    ? (WIDGET_META[s.widget ?? '']?.label ?? `Bloque retirado (${s.widget})`)
    : FIELD_TYPE_META[s.type as keyof typeof FIELD_TYPE_META]?.label ?? s.type;
  const Icon = TYPE_ICONS[isWidget ? `widget:${s.widget}` : s.type] ?? Type;

  return (
    <div style={{ ...B.card, ...(error ? B.cardError : {}) }}>
      {/* Top row: type badge + label + reorder/delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={B.typeBadge}><Icon size={12} /> {typeLabel}</span>
        <input
          value={s.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Nombre del campo (ej. Motivo de consulta)"
          style={{ ...B.input, flex: 1, minWidth: 120, fontWeight: 600 }}
        />
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Subir campo" title="Subir"
            style={{ ...B.smallBtn, opacity: index === 0 ? 0.3 : 1 }}>
            <ArrowUp size={15} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Bajar campo" title="Bajar"
            style={{ ...B.smallBtn, opacity: index === total - 1 ? 0.3 : 1 }}>
            <ArrowDown size={15} />
          </button>
          <button type="button" onClick={onRemove} aria-label="Eliminar campo" title="Eliminar"
            style={B.smallBtn}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--s400)'; }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Widget description — widgets have no hint/options/toggles */}
      {isWidget ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--s400)' }}>
          {WIDGET_META[s.widget ?? '']?.description ?? 'Este bloque ya no está disponible para plantillas nuevas.'}
        </p>
      ) : (
        <>
          <input
            value={s.hint}
            onChange={(e) => onPatch({ hint: e.target.value })}
            placeholder="Texto de ayuda para el profesional (opcional)"
            style={{ ...B.input, marginTop: 8, fontSize: 12 }}
          />

          {(s.type === 'select' || s.type === 'multiselect') && (
            <OptionsEditor options={s.options} onChange={(options) => onPatch({ options })} />
          )}

          {s.type === 'scale' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--s600)' }}>De</span>
              <input type="number" value={s.scale_min} min={0}
                onChange={(e) => onPatch({ scale_min: Number(e.target.value) })}
                style={{ ...B.input, width: 70 }} />
              <span style={{ fontSize: 12, color: 'var(--s600)' }}>a</span>
              <input type="number" value={s.scale_max} min={1}
                onChange={(e) => onPatch({ scale_max: Number(e.target.value) })}
                style={{ ...B.input, width: 70 }} />
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
            <label style={B.toggle}>
              <input type="checkbox" checked={s.required} onChange={(e) => onPatch({ required: e.target.checked })}
                style={{ accentColor: 'var(--teal)' }} />
              Obligatorio
            </label>
            <label style={B.toggle}>
              <input type="checkbox" checked={s.collapsed} onChange={(e) => onPatch({ collapsed: e.target.checked })}
                style={{ accentColor: 'var(--teal)' }} />
              Inicia plegado
            </label>
            {(s.type === 'select' || s.type === 'multiselect') && (
              <label style={B.toggle}>
                <input type="checkbox" checked={s.pills} onChange={(e) => onPatch({ pills: e.target.checked })}
                  style={{ accentColor: 'var(--teal)' }} />
                Mostrar como botones
              </label>
            )}
            {s.type === 'multiselect' && (
              <label style={B.toggle}>
                <input type="checkbox" checked={s.allow_other} onChange={(e) => onPatch({ allow_other: e.target.checked })}
                  style={{ accentColor: 'var(--teal)' }} />
                Permitir respuesta libre ("Otra")
              </label>
            )}
          </div>
        </>
      )}

      {error && (
        <p style={B.errorText}><AlertTriangle size={13} /> {error}</p>
      )}
    </div>
  );
}

// ── Options chips editor ─────────────────────────────────────────────────────

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.replace(/[{}|]/g, '').trim();
    if (t && !options.includes(t)) onChange([...options, t]);
    setDraft('');
  };

  return (
    <div style={{ marginTop: 8 }}>
      {options.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {options.map((opt) => (
            <span key={opt} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
              background: 'var(--s50)', border: '1px solid var(--s200)', borderRadius: 16,
              padding: '3px 6px 3px 11px', color: 'var(--s700)',
            }}>
              {opt}
              <button type="button" onClick={() => onChange(options.filter((o) => o !== opt))}
                aria-label={`Quitar opción ${opt}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 0, lineHeight: 1, fontSize: 12 }}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Escribe una opción y presiona Enter"
          style={{ ...B.input, flex: 1, fontSize: 12 }}
        />
        <button type="button" onClick={add} aria-label="Agregar opción"
          style={{
            padding: '0 14px', background: 'var(--teal)', color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>
          +
        </button>
      </div>
    </div>
  );
}
