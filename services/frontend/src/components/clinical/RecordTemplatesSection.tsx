import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Archive, Eye, EyeOff, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import {
  recordTemplatesApi,
  RecordTemplate,
  SectionDef,
} from '../../api/recordTemplates';
import { RecordType } from '../../api/clinicalRecords';

const RECORD_TYPE_LABEL: Record<string, string> = {
  INITIAL: 'Inicial (apertura)', EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta (cierre)', INTERCONSULTATION: 'Interconsulta',
};


// Only the widgets whose estructura no se puede armar con campos genéricos.
// Los antiguos (task_checklist, session_evaluation, etc.) hoy son campos
// select/multiselect/scale de la propia plantilla.
const WIDGET_LABELS: Record<string, string> = {
  mental_exam: 'Examen mental (lo llena el profesional, la IA nunca lo marca)',
  risk: 'Nivel de riesgo (campo de sistema)',
  treatment_plan: 'Plan de tratamiento',
  diagnoses: 'Diagnósticos CIE-10',
};

const PALETTE = `
**Tipos de campo disponibles para anotar en los encabezados ##:**

| Anotación | Render | Ejemplo |
|-----------|--------|---------|
| \`{text}\` | Área de texto libre (por defecto) | \`## Desarrollo {text}\` |
| \`{select:a|b|c}\` | Desplegable (una opción) | \`## Eje {select:Cognitivo|Emocional|Conductual}\` |
| \`{select:a|b|c} {pills}\` | Botones tipo pill (una opción) | \`## Insight {select:Alto|Medio|Bajo} {pills}\` |
| \`{multiselect:a|b|c}\` | Checkboxes (varias opciones) | \`## Barreras {multiselect:Tardanza|Silencios|Otra}\` |
| \`{multiselect:a|b|c} {pills}\` | Botones tipo pill (varias opciones) | \`## Eje {multiselect:Emocional|Conductual|Técnico} {pills}\` |
| \`{multiselect:...} {allow_other}\` | Permite agregar un valor libre además de las opciones | \`## Barreras {multiselect:Tardanza|Otra} {allow_other}\` |
| \`{scale:0-10}\` | Deslizador numérico | \`## Malestar {scale:0-10}\` |
| \`{checklist}\` | Lista de ítems de texto libre | \`## Tareas {checklist}\` |
| \`{widget:nombre}\` | Componente clínico integrado | \`## Riesgo {widget:risk}\` |
| \`{required}\` | Marca campo como obligatorio | \`## Motivo {text} {required}\` |
| \`{collapsed}\` | Inicia oculto tras un acordeón | \`## Tareas para casa {checklist} {collapsed}\` |

Arma los formularios combinando \`select\`/\`multiselect\` con \`{pills}\` y \`{allow_other}\`: la IA los completa automáticamente sin necesitar código nuevo en ningún stack. Los widgets quedan reservados para lo que un campo genérico no puede expresar.

**Widgets disponibles:**
${Object.entries(WIDGET_LABELS).map(([k, v]) => `- \`{widget:${k}}\` — ${v}`).join('\n')}

**Nombre de plantilla:** línea que comienza con \`# \` (un solo hash).
`.trim();

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

// ── SectionPreview ──────────────────────────────────────────────────────────
function SectionPreview({ sections }: { sections: SectionDef[] }) {
  if (sections.length === 0) return null;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sections.map((s) => (
        <li key={s.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 8px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>{s.label}</span>
          <span style={{ fontSize: 12, color: 'var(--s400)' }}>
            {s.type === 'widget' ? `widget:${s.widget}` : s.type}
            {s.type === 'select' ? ` [${(s.options ?? []).join(' | ')}]` : ''}
            {s.type === 'scale' ? ` [${s.scale_min ?? 0}–${s.scale_max ?? 10}]` : ''}
            {s.required ? ' *' : ''}
            {s.collapsed ? ' ⌄ oculto por defecto' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── TemplateEditor (inline panel, no modal) ─────────────────────────────────
interface EditorProps {
  initial?: RecordTemplate;
  onClose: () => void;
}

function TemplateEditor({ initial, onClose }: EditorProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  // Editable only on creation — the backend keeps record_type immutable on
  // update (existing records already reference the template under that type).
  const [recordType, setRecordType] = useState<RecordType>((initial?.record_type as RecordType) ?? 'INITIAL');
  const [markdown, setMarkdown] = useState(initial?.source_markdown ?? '');
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [preview, setPreview] = useState<SectionDef[]>(initial?.schema ?? []);
  const [showPalette, setShowPalette] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const nameFocus = useFocus();
  const mdFocus = useFocus();

  const parsePreview = useCallback(async (md: string) => {
    if (!md.trim()) { setPreview([]); setPreviewError(''); return; }
    try {
      const r = await recordTemplatesApi.parse(md);
      setPreview(r.sections);
      setPreviewError('');
      if (!name && r.suggested_name) setName(r.suggested_name);
    } catch {
      setPreviewError('Markdown inválido — revisa los encabezados ##');
    }
  }, [name]);

  useEffect(() => {
    const t = setTimeout(() => parsePreview(markdown), 500);
    return () => clearTimeout(t);
  }, [markdown, parsePreview]);

  const saveMutation = useMutation({
    mutationFn: () =>
      initial
        ? recordTemplatesApi.update(initial.id, { name, markdown })
        : recordTemplatesApi.create({ name, record_type: recordType, markdown, is_default: isDefault }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record-templates'] });
      onClose();
    },
  });

  const canSave = !saveMutation.isPending && name.trim() && markdown.trim() && preview.length > 0;

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
          {initial ? 'Editar plantilla' : 'Nueva plantilla'}
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

        {/* Markdown editor */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ ...S.label, margin: 0 }}>Formato en markdown</label>
            <button
              type="button"
              onClick={() => setShowPalette(p => !p)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: 'var(--teal-dark)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 0',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {showPalette ? <EyeOff size={13} /> : <Eye size={13} />}
              {showPalette ? 'Ocultar referencia' : 'Ver referencia'}
            </button>
          </div>
          {showPalette && (
            <pre style={{
              fontSize: 12,
              background: 'var(--s50)',
              border: '1px solid var(--s200)',
              borderRadius: 8,
              padding: '10px 12px',
              whiteSpace: 'pre-wrap',
              marginBottom: 8,
              maxHeight: 200,
              overflowY: 'auto',
              lineHeight: 1.6,
              fontFamily: "'DM Mono', monospace",
              color: 'var(--s700)',
            }}>
              {PALETTE}
            </pre>
          )}
          <textarea
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            rows={14}
            placeholder={`# Nombre de la plantilla (opcional)\n\n## Motivo de consulta {text} {required}\nQué trajo el paciente a la sesión.\n\n## Nivel de malestar {scale:0-10}\n\n## Examen mental {widget:mental_exam}\n\n## Tareas para casa {checklist}`}
            style={{
              ...S.textarea,
              ...(mdFocus.focused ? { boxShadow: '0 0 0 2px var(--teal-10)', border: '1px solid var(--teal)' } : {}),
            }}
            onFocus={mdFocus.onFocus}
            onBlur={mdFocus.onBlur}
          />
        </div>

        {/* Live preview */}
        {(preview.length > 0 || previewError) && (
          <div style={{
            background: 'var(--s50)',
            border: '1px solid var(--s100)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Vista previa
            </p>
            {previewError ? (
              <p style={{ fontSize: 12, color: 'var(--red)' }}>{previewError}</p>
            ) : (
              <SectionPreview sections={preview} />
            )}
          </div>
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

      {/* Footer */}
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
      {/* Main row */}
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
            label={mode === 'view' ? 'Ocultar markdown' : 'Ver markdown'}
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

      {/* Expanded region */}
      {mode === 'view' && (
        <div style={{ borderTop: '1px solid var(--s100)', padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Markdown fuente
          </p>
          <pre style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 12.5,
            lineHeight: 1.7,
            color: 'var(--s700)',
            background: 'var(--s50)',
            border: '1px solid var(--s200)',
            borderRadius: 8,
            padding: '12px 14px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
          }}>
            {tpl.source_markdown}
          </pre>
          {tpl.schema.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Secciones parseadas
              </p>
              <SectionPreview sections={tpl.schema} />
            </div>
          )}
        </div>
      )}

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
