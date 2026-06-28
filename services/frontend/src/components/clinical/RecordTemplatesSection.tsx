/**
 * RecordTemplatesSection — Settings panel for managing custom clinical-record templates.
 *
 * Mounted inside SettingsPage when the 'record_templates' section is selected.
 * Supports: listing, creating (markdown editor), editing (re-parse), archiving,
 * marking as default, and live preview of parsed sections.
 */
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Archive, Star, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import {
  recordTemplatesApi,
  RecordTemplate,
  SectionDef,
} from '../../api/recordTemplates';
import { RecordType } from '../../api/clinicalRecords';

const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  INITIAL: 'Apertura / Inicial',
  EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta',
  INTERCONSULTATION: 'Interconsulta',
};

const WIDGET_LABELS: Record<string, string> = {
  mental_exam: '🧠 Examen mental',
  formulation_5f: '📐 Formulación 5F',
  functional_analysis: '🔄 Análisis funcional',
  distress_scale: '📊 Escala de malestar (0-10)',
  task_checklist: '✅ Lista de tareas',
  task_adherence: '📋 Adherencia a tareas',
  session_evaluation: '⭐ Evaluación de sesión',
  functionality: '🏃 Funcionalidad',
  spa_history: '💊 Historia SPA',
  risk: '⚠️ Nivel de riesgo (campo de sistema)',
  treatment_plan: '🗺️ Plan de tratamiento',
  diagnoses: '🏥 Diagnósticos CIE-10',
};

const PALETTE = `
**Tipos de campo disponibles para anotar en los encabezados ##:**

| Anotación | Render | Ejemplo |
|-----------|--------|---------|
| \`{text}\` | Área de texto libre (por defecto) | \`## Desarrollo {text}\` |
| \`{select:a|b|c}\` | Desplegable | \`## Eje {select:Cognitivo|Emocional|Conductual}\` |
| \`{scale:0-10}\` | Deslizador numérico | \`## Malestar {scale:0-10}\` |
| \`{checklist}\` | Lista de ítems | \`## Tareas {checklist}\` |
| \`{widget:nombre}\` | Componente clínico integrado | \`## Riesgo {widget:risk}\` |
| \`{required}\` | Marca campo como obligatorio | \`## Motivo {text} {required}\` |

**Widgets disponibles:**
${Object.entries(WIDGET_LABELS).map(([k, v]) => `- \`{widget:${k}}\` — ${v}`).join('\n')}

**Nombre de plantilla:** línea que comienza con \`# \` (un solo hash).
`.trim();

// ── SectionPreview ─────────────────────────────────────────────────────────
function SectionPreview({ sections }: { sections: SectionDef[] }) {
  if (sections.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-gray-600">
      {sections.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span className="font-medium">{s.label}</span>
          <span className="text-gray-400">
            {s.type === 'widget' ? `widget:${s.widget}` : s.type}
            {s.type === 'select' ? ` [${(s.options ?? []).join(' | ')}]` : ''}
            {s.type === 'scale' ? ` [${s.scale_min ?? 0}–${s.scale_max ?? 10}]` : ''}
            {s.required ? ' *' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── TemplateEditor ─────────────────────────────────────────────────────────
interface EditorProps {
  initial?: RecordTemplate;
  onClose: () => void;
}

function TemplateEditor({ initial, onClose }: EditorProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [recordType, setRecordType] = useState<RecordType>(
    (initial?.record_type as RecordType) ?? 'EVOLUTION',
  );
  const [markdown, setMarkdown] = useState(initial?.source_markdown ?? '');
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [preview, setPreview] = useState<SectionDef[]>(initial?.schema ?? []);
  const [showPalette, setShowPalette] = useState(false);
  const [previewError, setPreviewError] = useState('');

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

  // Debounced live preview
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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {initial ? 'Editar plantilla' : 'Nueva plantilla de registro'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de la plantilla"
                className="w-full rounded border-gray-300 text-sm"
              />
            </div>
            {!initial && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de registro</label>
                <select
                  value={recordType}
                  onChange={(e) => setRecordType(e.target.value as RecordType)}
                  className="w-full rounded border-gray-300 text-sm"
                >
                  {(['INITIAL', 'EVOLUTION', 'DISCHARGE'] as RecordType[]).map((rt) => (
                    <option key={rt} value={rt}>{RECORD_TYPE_LABELS[rt]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Markdown editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Formato en markdown</label>
              <button
                type="button"
                onClick={() => setShowPalette(p => !p)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                {showPalette ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPalette ? 'Ocultar referencia' : 'Ver referencia de tipos'}
              </button>
            </div>
            {showPalette && (
              <pre className="text-xs bg-gray-50 border rounded p-3 whitespace-pre-wrap mb-2 max-h-52 overflow-y-auto">
                {PALETTE}
              </pre>
            )}
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={14}
              placeholder={`# Nombre de la plantilla (opcional)

## Motivo de consulta {text} {required}
Qué trajo el paciente a la sesión.

## Nivel de malestar {scale:0-10}

## Examen mental {widget:mental_exam}

## Tareas para casa {checklist}`}
              className="w-full rounded border-gray-300 text-sm font-mono"
            />
          </div>

          {/* Live preview */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Vista previa de secciones:</p>
            {previewError ? (
              <p className="text-xs text-red-500">{previewError}</p>
            ) : (
              <SectionPreview sections={preview} />
            )}
          </div>

          {/* Default toggle (new only) */}
          {!initial && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Usar como plantilla predeterminada para este tipo de registro
            </label>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancelar
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name.trim() || !markdown.trim() || preview.length === 0}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Crear plantilla')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TemplateCard ────────────────────────────────────────────────────────────
function TemplateCard({
  tpl,
  onEdit,
}: {
  tpl: RecordTemplate;
  onEdit: (t: RecordTemplate) => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: () => recordTemplatesApi.archive(tpl.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-templates'] }),
  });
  const defaultMutation = useMutation({
    mutationFn: () => recordTemplatesApi.setDefault(tpl.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['record-templates'] }),
  });

  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-800 truncate">{tpl.name}</span>
            {tpl.is_default && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" /> Predeterminada
              </span>
            )}
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {RECORD_TYPE_LABELS[tpl.record_type as RecordType] ?? tpl.record_type}
            </span>
            <span className="text-xs text-gray-400">v{tpl.version}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{tpl.schema.length} sección(es)</p>
        </div>

        <div className="flex items-center gap-2 ml-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-gray-400 hover:text-gray-600"
            title="Ver secciones"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {!tpl.is_default && (
            <button
              onClick={() => defaultMutation.mutate()}
              disabled={defaultMutation.isPending}
              className="text-xs text-yellow-600 hover:text-yellow-700 border border-yellow-200 rounded px-2 py-1"
              title="Marcar como predeterminada"
            >
              <Star className="w-3 h-3 inline mr-1" />Predeterminar
            </button>
          )}
          <button
            onClick={() => onEdit(tpl)}
            className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-1"
          >
            Editar
          </button>
          <button
            onClick={() => {
              if (confirm(`¿Archivar la plantilla "${tpl.name}"? Los registros existentes no se verán afectados.`))
                archiveMutation.mutate();
            }}
            disabled={archiveMutation.isPending}
            className="text-xs text-gray-400 hover:text-red-500"
            title="Archivar"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && <SectionPreview sections={tpl.schema} />}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function RecordTemplatesSection() {
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<RecordTemplate | undefined>();
  const [filterType, setFilterType] = useState<RecordType | ''>('');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['record-templates', filterType],
    queryFn: () => recordTemplatesApi.list(filterType as RecordType || undefined),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Plantillas de registro clínico</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Define los campos y secciones de cada tipo de registro. Al grabar una sesión, la IA rellena las secciones de la plantilla elegida.
          </p>
        </div>
        <button
          onClick={() => { setEditing(undefined); setShowEditor(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
        >
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      {/* Filter */}
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value as RecordType | '')}
        className="rounded border-gray-300 text-sm"
      >
        <option value="">Todos los tipos</option>
        {(['INITIAL', 'EVOLUTION', 'DISCHARGE'] as RecordType[]).map(rt => (
          <option key={rt} value={rt}>{RECORD_TYPE_LABELS[rt]}</option>
        ))}
      </select>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando plantillas…</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No hay plantillas personalizadas.</p>
          <p className="text-xs mt-1">Crea una para personalizar los campos de tus registros clínicos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(tpl => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              onEdit={(t) => { setEditing(t); setShowEditor(true); }}
            />
          ))}
        </div>
      )}

      {/* Consent templates note */}
      <div className="border-t pt-4">
        <p className="text-xs text-gray-400">
          Las <strong>plantillas de consentimiento</strong> (Tratamiento, Grabación, etc.)
          se editan en la sección anterior "Plantillas clínicas".
        </p>
      </div>

      {/* Editor modal */}
      {showEditor && (
        <TemplateEditor
          initial={editing}
          onClose={() => { setShowEditor(false); setEditing(undefined); }}
        />
      )}
    </div>
  );
}
