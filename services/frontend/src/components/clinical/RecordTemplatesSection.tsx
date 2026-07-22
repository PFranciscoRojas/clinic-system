import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Archive, ChevronDown, ChevronUp, Pencil, FileText, Sparkles } from 'lucide-react';
import {
  recordTemplatesApi,
  RecordTemplate,
} from '../../api/recordTemplates';
import { RecordType } from '../../api/clinicalRecords';
import TemplateBuilder from './TemplateBuilder';
import TemplatedSectionsForm, { SectionsState } from './TemplatedSectionsForm';
import {
  BuilderSection, fromSectionDefs, sectionsToMarkdown, sectionsMatch,
  hasBuilderErrors, toPreviewSchema,
} from '../../lib/templateMarkdown';
import { TEMPLATE_EXAMPLES, TemplateExample } from '../../lib/templateExamples';

const RECORD_TYPE_LABEL: Record<string, string> = {
  INITIAL: 'Inicial (apertura)', EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta (cierre)', INTERCONSULTATION: 'Interconsulta',
};

// ── Shared style tokens (inline, following app convention) ──────────────────
const S = {
  input: {
    width: '100%',
    height: 40,
    border: '1px solid var(--s200)',
    borderRadius: 8,
    padding: '0 12px',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    background: '#fff',
    color: 'var(--s800)',
    outline: 'none',
    transition: 'box-shadow .15s',
  } as React.CSSProperties,
  inputFocus: {
    boxShadow: '0 0 0 2px var(--teal-10)',
    border: '1px solid var(--teal)',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    border: '1px solid var(--s200)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    fontFamily: "'DM Mono', monospace",
    background: '#fff',
    color: 'var(--s800)',
    outline: 'none',
    resize: 'vertical',
    lineHeight: 1.6,
    transition: 'box-shadow .15s',
  } as React.CSSProperties,
  select: {
    border: '1px solid var(--s200)',
    borderRadius: 8,
    padding: '0 12px',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    background: '#fff',
    color: 'var(--s800)',
    height: 40,
    outline: 'none',
    cursor: 'pointer',
    transition: 'box-shadow .15s',
  } as React.CSSProperties,
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 40,
    padding: '0 18px',
    background: 'var(--teal)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'background .15s',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 40,
    padding: '0 18px',
    background: '#fff',
    color: 'var(--s600)',
    border: '1px solid var(--s200)',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'background .15s',
  } as React.CSSProperties,
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    cursor: 'pointer',
    transition: 'background .15s, color .15s',
    padding: 0,
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--s600)',
    marginBottom: 6,
  } as React.CSSProperties,
};

// ── Focusable input hook ─────────────────────────────────────────────────────
function useFocus() {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
}

// ── TemplateEditor (inline panel, no modal) ─────────────────────────────────
interface EditorProps {
  initial?: RecordTemplate;
  onClose: () => void;
}

const pickCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '14px 16px',
  border: '1px solid var(--s200)',
  borderRadius: 10,
  background: '#fff',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: "'DM Sans', sans-serif",
  transition: 'border-color .15s',
};

function TemplateEditor({ initial, onClose }: EditorProps) {
  const qc = useQueryClient();
  // Creation starts at the gallery step; editing jumps straight to the fields.
  const [stage, setStage] = useState<'pick' | 'edit'>(initial ? 'edit' : 'pick');
  const [name, setName] = useState(initial?.name ?? '');
  // Editable only on creation — the backend keeps record_type immutable on
  // update (existing records already reference the template under that type).
  const [recordType, setRecordType] = useState<RecordType>((initial?.record_type as RecordType) ?? 'INITIAL');
  // The stored schema (already parsed server-side) seeds the builder. The
  // markdown source is an internal storage format — the professional only
  // ever sees the visual builder and the rendered preview.
  const [sections, setSections] = useState<BuilderSection[]>(() => (initial ? fromSectionDefs(initial.schema) : []));
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [editorError, setEditorError] = useState('');
  const [previewValues, setPreviewValues] = useState<SectionsState>({});
  const [busy, setBusy] = useState(false);

  const nameFocus = useFocus();

  const pickExample = async (ex: TemplateExample) => {
    setBusy(true);
    setEditorError('');
    try {
      const r = await recordTemplatesApi.parse(ex.markdown);
      setSections(fromSectionDefs(r.sections));
      setName(ex.title);
      setRecordType(ex.record_type);
      setStage('edit');
    } catch {
      setEditorError('No se pudo cargar el ejemplo. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const md = sectionsToMarkdown(sections);
      // Fail-closed round-trip: the markdown about to be saved must parse
      // back to exactly what the builder shows, or nothing is persisted.
      const r = await recordTemplatesApi.parse(md);
      if (!sectionsMatch(sections, r.sections)) throw new Error('roundtrip_mismatch');
      return initial
        ? recordTemplatesApi.update(initial.id, { name, markdown: md })
        : recordTemplatesApi.create({ name, record_type: recordType, markdown: md, is_default: isDefault });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record-templates'] });
      onClose();
    },
    onError: (e) => {
      setEditorError(
        e instanceof Error && e.message === 'roundtrip_mismatch'
          ? 'La plantilla generada no coincide con lo que muestra el editor. Revisa los campos e intenta de nuevo.'
          : 'No se pudo guardar la plantilla. Revisa los campos e intenta de nuevo.',
      );
    },
  });

  const canSave = !saveMutation.isPending && !busy && !!name.trim()
    && sections.length > 0 && !hasBuilderErrors(sections);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--teal)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: '1px solid var(--s100)',
        background: 'var(--teal-l)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--teal-dark)' }}>
          {stage === 'pick' ? '¿Cómo quieres empezar?' : initial ? 'Editar plantilla' : 'Nueva plantilla'}
        </span>
        <button
          onClick={onClose}
          aria-label="Cerrar editor"
          style={{ ...S.iconBtn, color: 'var(--s400)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s100)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--s700)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--s400)'; }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      {stage === 'pick' ? (
        <div style={{ padding: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--s500)', margin: '0 0 14px' }}>
            Empieza desde cero o toma un formato de ejemplo y ajústalo a tu práctica.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            <button
              type="button"
              onClick={() => { setSections([]); setStage('edit'); }}
              style={pickCard}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--s800)' }}>
                <Sparkles size={16} color="var(--teal)" /> Empezar desde cero
              </span>
              <span style={{ fontSize: 12, color: 'var(--s400)' }}>
                Arma tu formato campo por campo con el editor visual.
              </span>
            </button>
            {TEMPLATE_EXAMPLES.map(ex => (
              <button
                key={ex.title}
                type="button"
                disabled={busy}
                onClick={() => pickExample(ex)}
                style={{ ...pickCard, opacity: busy ? 0.6 : 1 }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = 'var(--teal)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--s800)' }}>
                  <FileText size={16} color="var(--teal)" /> {ex.title}
                </span>
                <span style={{
                  alignSelf: 'flex-start', fontSize: 11, background: 'var(--teal-l)', color: 'var(--teal-dark)',
                  border: '1px solid var(--teal-100)', borderRadius: 99, padding: '1px 8px', fontWeight: 600,
                }}>
                  {RECORD_TYPE_LABEL[ex.record_type] ?? ex.record_type}
                </span>
                <span style={{ fontSize: 12, color: 'var(--s400)' }}>{ex.description}</span>
              </button>
            ))}
          </div>
          {editorError && <p style={{ fontSize: 12, color: 'var(--red)', margin: '12px 0 0' }}>{editorError}</p>}
        </div>
      ) : (
      <div style={{ padding: '18px 18px 0' }}>

        {/* Name + record type */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
          <div style={{ flex: '2 1 220px', minWidth: 0 }}>
            <label style={S.label}>Nombre</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre de la plantilla"
              style={{ ...S.input, ...(nameFocus.focused ? S.inputFocus : {}) }}
              onFocus={nameFocus.onFocus}
              onBlur={nameFocus.onBlur}
            />
          </div>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={S.label}>Tipo de registro</label>
            {initial ? (
              <div style={{ ...S.input, display: 'flex', alignItems: 'center', background: 'var(--s50)', color: 'var(--s500)', cursor: 'default' }}>
                {RECORD_TYPE_LABEL[recordType] ?? recordType}
              </div>
            ) : (
              <select
                value={recordType}
                onChange={e => setRecordType(e.target.value as RecordType)}
                style={{ ...S.select, width: '100%' }}
              >
                <option value="INITIAL">Inicial (apertura de proceso)</option>
                <option value="EVOLUTION">Evolución (seguimiento)</option>
                <option value="DISCHARGE">Alta (cierre de proceso)</option>
              </select>
            )}
          </div>
        </div>

        {/* Visual builder (left) + live form preview (right; stacks on mobile) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 16,
          alignItems: 'start',
          marginBottom: 16,
        }}>
          <div style={{ minWidth: 0 }}>
            <label style={{ ...S.label, marginBottom: 8 }}>Campos del formato</label>
            <TemplateBuilder sections={sections} onChange={setSections} />
          </div>
          <div style={{
            minWidth: 0,
            background: 'var(--s50)',
            border: '1px solid var(--s100)',
            borderRadius: 10,
            padding: 14,
            // Sticky beside the builder, so it needs an inner scroll — but bounded
            // by the viewport instead of a fixed 620px, which cut the preview short
            // on tall screens and left the panel half empty.
            maxHeight: 'calc(100vh - 24px)',
            overflowY: 'auto',
            position: 'sticky',
            top: 8,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              Vista previa — así lo verá el profesional
            </p>
            {sections.length > 0 ? (
              <TemplatedSectionsForm
                schema={toPreviewSchema(sections)}
                value={previewValues}
                onChange={setPreviewValues}
              />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--s400)', margin: 0 }}>
                Agrega el primer campo y aquí verás el formulario tal como aparecerá en la sesión.
              </p>
            )}
          </div>
        </div>

        {editorError && (
          <p style={{ fontSize: 12, color: 'var(--red)', margin: '0 0 14px' }}>{editorError}</p>
        )}

        {/* Default checkbox (new only) */}
        {!initial && (
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 13,
            color: 'var(--s700)',
            cursor: 'pointer',
            marginBottom: 16,
          }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--teal)', width: 15, height: 15 }}
            />
            Usar como plantilla predeterminada para este tipo de registro
          </label>
        )}
      </div>
      )}

      {/* Footer */}
      {stage === 'edit' && (
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 10,
        padding: '12px 18px',
        borderTop: '1px solid var(--s100)',
        background: 'var(--s50)',
      }}>
        <button
          onClick={onClose}
          style={S.btnSecondary}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s100)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
        >
          Cancelar
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!canSave}
          style={{
            ...S.btnPrimary,
            background: canSave ? 'var(--teal)' : 'var(--s200)',
            cursor: canSave ? 'pointer' : 'not-allowed',
            color: canSave ? '#fff' : 'var(--s400)',
          }}
          onMouseEnter={e => { if (canSave) (e.currentTarget as HTMLButtonElement).style.background = 'var(--teal-dark)'; }}
          onMouseLeave={e => { if (canSave) (e.currentTarget as HTMLButtonElement).style.background = 'var(--teal)'; }}
        >
          {saveMutation.isPending ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Crear plantilla')}
        </button>
      </div>
      )}
    </div>
  );
}

// ── TemplateCard ─────────────────────────────────────────────────────────────
type CardMode = 'collapsed' | 'view' | 'edit';

function IconButton({
  onClick,
  disabled,
  label,
  children,
  hoverBg,
  hoverColor,
  color,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
  hoverBg: string;
  hoverColor: string;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{ ...S.iconBtn, color, opacity: disabled ? 0.4 : 1 }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = hoverBg;
          (e.currentTarget as HTMLButtonElement).style.color = hoverColor;
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = color;
      }}
    >
      {children}
    </button>
  );
}

function TemplateCard({ tpl }: { tpl: RecordTemplate }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<CardMode>('collapsed');

  const archiveMutation = useMutation({
    mutationFn: () => recordTemplatesApi.archive(tpl.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-templates'] }),
  });
  const toggle = (next: CardMode) => setMode(m => m === next ? 'collapsed' : next);

  return (
    <div
      className="card"
      style={{
        overflow: 'hidden',
        border: mode !== 'collapsed' ? '1px solid var(--teal)' : '1px solid var(--s200)',
        transition: 'border-color .2s',
      }}
    >
      {/* Main row (+ side-by-side preview when viewing, so it appears beside
          the info column instead of pushing the page down) */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ flex: mode === 'view' ? '0 0 280px' : '1 1 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px' }}>
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', lineHeight: 1.3 }}>
                  {tpl.name}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 11,
                  background: 'var(--teal-l)',
                  color: 'var(--teal-dark)',
                  border: '1px solid var(--teal-100)',
                  borderRadius: 99,
                  padding: '1px 8px',
                  fontWeight: 600,
                }}>
                  {RECORD_TYPE_LABEL[tpl.record_type] ?? tpl.record_type}
                </span>
                {tpl.is_default && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: 11,
                    background: '#d1fae5',
                    color: '#065f46',
                    border: '1px solid #6ee7b7',
                    borderRadius: 99,
                    padding: '1px 8px',
                    fontWeight: 600,
                  }}>
                    Predeterminado
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--s400)' }}>
                {tpl.schema.length} {tpl.schema.length === 1 ? 'sección' : 'secciones'} · v{tpl.version}
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <IconButton
                onClick={() => toggle('view')}
                label={mode === 'view' ? 'Ocultar vista previa' : 'Ver cómo se ve'}
                color="var(--s400)"
                hoverBg="var(--s100)"
                hoverColor="var(--s700)"
              >
                {mode === 'view' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
              <IconButton
                onClick={() => toggle('edit')}
                label={mode === 'edit' ? 'Cerrar editor' : 'Editar plantilla'}
                color={mode === 'edit' ? 'var(--teal)' : 'var(--s400)'}
                hoverBg="var(--teal-l)"
                hoverColor="var(--teal-dark)"
              >
                <Pencil size={15} />
              </IconButton>
              <IconButton
                onClick={() => {
                  if (confirm(`¿Archivar "${tpl.name}"? Los registros existentes no se verán afectados.`))
                    archiveMutation.mutate();
                }}
                disabled={archiveMutation.isPending}
                label="Archivar plantilla"
                color="var(--s300)"
                hoverBg="#fff5f5"
                hoverColor="var(--red)"
              >
                <Archive size={15} />
              </IconButton>
            </div>
          </div>
        </div>

        {/* Preview panel — the format rendered exactly as the professional
            will see it in session (the markdown source is internal storage,
            never shown here). Beside the info column so it gets the bulk of
            the card's width instead of a short strip below it. */}
        {mode === 'view' && (
          <div style={{
            flex: '1 1 auto',
            minWidth: 0,
            borderLeft: '1px solid var(--s100)',
            padding: '14px 16px',
            background: 'var(--s50)',
            // No inner scroll here: this panel is not sticky, so capping it only
            // nested a scrollbar inside the page's own. The card grows with the
            // format and the preview is readable end to end.
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Vista previa — así lo ve el profesional en sesión
            </p>
            <TemplatedSectionsForm schema={tpl.schema} value={{}} onChange={() => {}} disabled />
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <div style={{ borderTop: '1px solid var(--s100)', padding: 16 }}>
          <TemplateEditor initial={tpl} onClose={() => setMode('collapsed')} />
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function RecordTemplatesSection() {
  const [creating, setCreating] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['record-templates'],
    queryFn: () => recordTemplatesApi.list(),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>
            Plantillas de registro clínico
          </h3>
          <p style={{ fontSize: 13, color: 'var(--s500)', marginTop: 4, maxWidth: 480 }}>
            Define los campos de cada tipo de registro. La IA rellena las secciones de la plantilla elegida al grabar una sesión.
          </p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          style={{
            ...S.btnPrimary,
            background: creating ? 'var(--teal-dark)' : 'var(--teal)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--teal-dark)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = creating ? 'var(--teal-dark)' : 'var(--teal)'; }}
        >
          <Plus size={16} />
          {creating ? 'Cancelar' : 'Nueva plantilla'}
        </button>
      </div>

      {/* Inline create panel */}
      {creating && (
        <div className="anim-fade-up">
          <TemplateEditor onClose={() => setCreating(false)} />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: 72,
              background: 'var(--s100)',
              borderRadius: 'var(--radius)',
              animation: 'pulse 1.5s ease infinite',
            }} />
          ))}
        </div>
      ) : templates.length === 0 && !creating ? (
        <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--s400)' }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'var(--teal-l)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <Plus size={22} color="var(--teal)" />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--s600)', margin: '0 0 4px' }}>
            Tu consultorio aún no tiene formatos
          </p>
          <p style={{ fontSize: 13, color: 'var(--s400)', margin: 0 }}>
            Crea uno con "Nueva plantilla" para definir los campos de tus registros clínicos.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(tpl => (
            <TemplateCard key={tpl.id} tpl={tpl} />
          ))}
        </div>
      )}

      {/* Footer note */}
      <div style={{ borderTop: '1px solid var(--s200)', paddingTop: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--s400)', margin: 0 }}>
          Las <strong style={{ color: 'var(--s500)' }}>plantillas de consentimiento</strong> (Tratamiento, Grabación, etc.)
          se editan en la sección "Plantillas clínicas".
        </p>
      </div>
    </div>
  );
}
