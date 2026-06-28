import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Archive, Star, Eye, EyeOff, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
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

const RECORD_TYPE_SHORT: Record<RecordType, string> = {
  INITIAL: 'Apertura',
  EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta',
  INTERCONSULTATION: 'Interconsulta',
};

const WIDGET_LABELS: Record<string, string> = {
  mental_exam: 'Examen mental',
  formulation_5f: 'Formulación 5F',
  functional_analysis: 'Análisis funcional',
  distress_scale: 'Escala de malestar (0-10)',
  task_checklist: 'Lista de tareas',
  task_adherence: 'Adherencia a tareas',
  session_evaluation: 'Evaluación de sesión',
  functionality: 'Funcionalidad',
  spa_history: 'Historia SPA',
  risk: 'Nivel de riesgo (campo de sistema)',
  treatment_plan: 'Plan de tratamiento',
  diagnoses: 'Diagnósticos CIE-10',
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
    <ul className="mt-2 space-y-1.5">
      {sections.map((s) => (
        <li key={s.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="font-medium text-gray-700">{s.label}</span>
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
    // Sheet slides up from bottom on mobile; centered dialog on sm+
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            {initial ? 'Editar plantilla' : 'Nueva plantilla'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="h-9 w-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 space-y-4">
          {/* Name + Type — stacked on mobile, side-by-side on sm+ */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de la plantilla"
                className="w-full h-11 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            {!initial && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de registro</label>
                <select
                  value={recordType}
                  onChange={(e) => setRecordType(e.target.value as RecordType)}
                  className="w-full h-11 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Formato en markdown</label>
              <button
                type="button"
                onClick={() => setShowPalette(p => !p)}
                className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 py-1"
              >
                {showPalette ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPalette ? 'Ocultar referencia' : 'Ver referencia'}
              </button>
            </div>
            {showPalette && (
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap mb-2 max-h-48 overflow-y-auto leading-relaxed">
                {PALETTE}
              </pre>
            )}
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={12}
              placeholder={`# Nombre de la plantilla (opcional)

## Motivo de consulta {text} {required}
Qué trajo el paciente a la sesión.

## Nivel de malestar {scale:0-10}

## Examen mental {widget:mental_exam}

## Tareas para casa {checklist}`}
              className="w-full rounded-lg border border-gray-300 text-sm font-mono p-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Live preview */}
          {(preview.length > 0 || previewError) && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Vista previa
              </p>
              {previewError ? (
                <p className="text-xs text-red-500">{previewError}</p>
              ) : (
                <SectionPreview sections={preview} />
              )}
            </div>
          )}

          {/* Default toggle (new only) */}
          {!initial && (
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-gray-700">
                Usar como plantilla predeterminada para este tipo de registro
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-t flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 sm:flex-none h-11 px-5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name.trim() || !markdown.trim() || preview.length === 0}
            className="flex-1 sm:flex-none h-11 px-5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
    <div className="border border-gray-200 rounded-xl bg-white hover:border-gray-300 hover:shadow-sm transition-all">
      {/* Main row */}
      <div className="flex items-start gap-3 p-4">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="font-semibold text-gray-800 text-sm leading-snug">{tpl.name}</span>
            {tpl.is_default && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                <Star className="w-3 h-3" /> Predeterminada
              </span>
            )}
            <span className="inline-flex items-center text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
              {RECORD_TYPE_SHORT[tpl.record_type as RecordType] ?? tpl.record_type}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {tpl.schema.length} {tpl.schema.length === 1 ? 'sección' : 'secciones'} · v{tpl.version}
          </p>
        </div>

        {/* Actions — icon-only (44px touch targets) */}
        <div className="flex items-center gap-0.5 shrink-0 -mr-1">
          <button
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Ocultar secciones' : 'Ver secciones'}
            className="h-10 w-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {!tpl.is_default && (
            <button
              onClick={() => defaultMutation.mutate()}
              disabled={defaultMutation.isPending}
              aria-label="Marcar como predeterminada"
              title="Predeterminar"
              className="h-10 w-10 flex items-center justify-center rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-40 transition-colors"
            >
              <Star className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(tpl)}
            aria-label="Editar plantilla"
            title="Editar"
            className="h-10 w-10 flex items-center justify-center rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`¿Archivar "${tpl.name}"? Los registros existentes no se verán afectados.`))
                archiveMutation.mutate();
            }}
            disabled={archiveMutation.isPending}
            aria-label="Archivar plantilla"
            title="Archivar"
            className="h-10 w-10 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded sections */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-3">
            <SectionPreview sections={tpl.schema} />
          </div>
        </div>
      )}
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
      {/* Header — stacks on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Plantillas de registro clínico</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Define los campos de cada tipo de registro. La IA rellena las secciones de la plantilla elegida al grabar una sesión.
          </p>
        </div>
        <button
          onClick={() => { setEditing(undefined); setShowEditor(true); }}
          className="flex items-center justify-center gap-2 h-11 px-4 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 active:bg-purple-800 transition-colors shrink-0 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva plantilla
        </button>
      </div>

      {/* Filter — full width on mobile */}
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value as RecordType | '')}
        className="w-full sm:w-auto h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      >
        <option value="">Todos los tipos</option>
        {(['INITIAL', 'EVOLUTION', 'DISCHARGE'] as RecordType[]).map(rt => (
          <option key={rt} value={rt}>{RECORD_TYPE_LABELS[rt]}</option>
        ))}
      </select>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-14 text-gray-400">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
            <Plus className="w-6 h-6 text-purple-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">Sin plantillas personalizadas</p>
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

      {/* Note */}
      <div className="border-t pt-4">
        <p className="text-xs text-gray-400">
          Las <strong>plantillas de consentimiento</strong> (Tratamiento, Grabación, etc.)
          se editan en la sección "Plantillas clínicas".
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
