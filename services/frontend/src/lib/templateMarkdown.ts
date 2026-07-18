/**
 * templateMarkdown — client-side inverse of the server's template markdown
 * parser (core-api internal/recordtemplates/markdown.go).
 *
 * The visual template builder edits BuilderSection[] in memory; this module
 * serializes that state back to the annotated-markdown source of truth that
 * the backend stores in clinical_record_templates.source_markdown. The server
 * stays authoritative: before saving, the editor round-trips the generated
 * markdown through POST /record-templates/parse and refuses to save on any
 * mismatch, so a serializer bug can never persist a template that differs
 * from what the builder showed.
 */

import { SectionDef, FieldType } from '../api/recordTemplates';

/** Widgets accepted by the parser on new saves (knownWidgets in markdown.go). */
export const KNOWN_WIDGETS = ['mental_exam', 'risk', 'treatment_plan', 'diagnoses'] as const;

export interface FieldTypeMeta {
  label: string;
  description: string;
}

/** User-facing names for the generic field types, in picker order. */
export const FIELD_TYPE_META: Record<Exclude<FieldType, 'widget'>, FieldTypeMeta> = {
  text: { label: 'Texto libre', description: 'Área de texto para escribir libremente' },
  select: { label: 'Selección única', description: 'Se elige una sola opción de una lista' },
  multiselect: { label: 'Selección múltiple', description: 'Se marcan una o varias opciones' },
  scale: { label: 'Escala numérica', description: 'Deslizador entre un mínimo y un máximo' },
  checklist: { label: 'Lista de ítems', description: 'Ítems de texto libre, agregados uno a uno' },
};

/** User-facing names for the clinical widget blocks. */
export const WIDGET_META: Record<string, FieldTypeMeta> = {
  mental_exam: {
    label: 'Examen mental',
    description: 'Checklist clínico por dominios. Lo llena el profesional; la IA nunca lo marca.',
  },
  risk: {
    label: 'Nivel de riesgo',
    description: 'Campo de sistema (ninguno / ideación / plan / intento). La IA puede sugerirlo.',
  },
  treatment_plan: {
    label: 'Plan de tratamiento',
    description: 'Panel integrado con los objetivos terapéuticos del paciente.',
  },
  diagnoses: {
    label: 'Diagnósticos CIE-10',
    description: 'Panel integrado con los diagnósticos del paciente.',
  },
};

/**
 * One field being edited in the visual builder. Mirrors SectionDef but with a
 * client-only stable id (for React lists across reorders) and without `key`,
 * which only the server derives (slugify of the label).
 */
export interface BuilderSection {
  id: string;
  label: string;
  hint: string;
  required: boolean;
  collapsed: boolean;
  type: FieldType;
  options: string[];
  pills: boolean;
  allow_other: boolean;
  scale_min: number;
  scale_max: number;
  widget?: string;
}

let seq = 0;
export const nextSectionId = () => `bs${++seq}`;

/** A fresh builder field of the given generic type, or a widget block. */
export function newBuilderSection(type: FieldType, widget?: string): BuilderSection {
  return {
    id: nextSectionId(),
    label: type === 'widget' ? (WIDGET_META[widget ?? '']?.label ?? '') : '',
    hint: '',
    required: false,
    collapsed: false,
    type,
    options: [],
    pills: false,
    allow_other: false,
    scale_min: 0,
    scale_max: 10,
    widget,
  };
}

/** Server schema → builder state (when editing an existing template). */
export function fromSectionDefs(defs: SectionDef[]): BuilderSection[] {
  return defs.map((d) => ({
    id: nextSectionId(),
    label: d.label,
    hint: d.hint ?? '',
    required: d.required,
    collapsed: d.collapsed,
    type: d.type,
    options: d.options ?? [],
    pills: d.display === 'pills',
    allow_other: d.allow_other ?? false,
    scale_min: d.scale_min ?? 0,
    scale_max: d.scale_max ?? 10,
    widget: d.widget,
  }));
}

// ── Sanitizers ───────────────────────────────────────────────────────────────
// Braces would be eaten as annotations and '|' would split options, so they
// are stripped from user text before serializing. Hints collapse to one line
// (the parser joins hint lines with spaces anyway) and lose any leading '#'
// so they can't be mistaken for a heading.

export const sanitizeLabel = (s: string) => s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
export const sanitizeHint = (s: string) => s.replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim();
export const sanitizeOption = (s: string) => s.replace(/[{}|]/g, '').replace(/\s+/g, ' ').trim();

/** Mirror of slugify in markdown.go — used to detect duplicate keys client-side. */
export function slugifyLabel(label: string): string {
  const lower = label.toLowerCase();
  let out = '';
  let prev = '_';
  for (const r of lower) {
    if (/[a-z0-9]/.test(r)) {
      out += r;
      prev = r;
    } else if (prev !== '_') {
      out += '_';
      prev = '_';
    }
  }
  out = out.replace(/^_+|_+$/g, '');
  return out || 'section';
}

// ── Serialization ────────────────────────────────────────────────────────────

function headingFor(s: BuilderSection): string {
  const anns: string[] = [];
  switch (s.type) {
    case 'select':
      anns.push(`{select:${s.options.map(sanitizeOption).filter(Boolean).join('|')}}`);
      break;
    case 'multiselect':
      anns.push(`{multiselect:${s.options.map(sanitizeOption).filter(Boolean).join('|')}}`);
      break;
    case 'scale':
      anns.push(`{scale:${s.scale_min}-${s.scale_max}}`);
      break;
    case 'checklist':
      anns.push('{checklist}');
      break;
    case 'widget':
      anns.push(`{widget:${s.widget ?? ''}}`);
      break;
    default:
      break; // text is the parser default — no annotation needed
  }
  if ((s.type === 'select' || s.type === 'multiselect') && s.pills) anns.push('{pills}');
  if (s.type === 'multiselect' && s.allow_other) anns.push('{allow_other}');
  if (s.required) anns.push('{required}');
  if (s.collapsed) anns.push('{collapsed}');
  return ['##', sanitizeLabel(s.label), ...anns].join(' ');
}

/**
 * Serialize builder state to the markdown the backend stores. The template
 * name travels in the API body, not in the markdown, so no leading `# ` line.
 */
export function sectionsToMarkdown(sections: BuilderSection[]): string {
  const blocks = sections.map((s) => {
    const hint = sanitizeHint(s.hint);
    return hint ? `${headingFor(s)}\n${hint}` : headingFor(s);
  });
  return blocks.join('\n\n') + '\n';
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Per-section error message, or null when the section is valid. */
export function sectionError(s: BuilderSection): string | null {
  if (!sanitizeLabel(s.label)) return 'Escribe un nombre para el campo.';
  if (s.type === 'widget') {
    if (!s.widget || !(KNOWN_WIDGETS as readonly string[]).includes(s.widget)) {
      return 'Este bloque fue retirado del sistema: conviértelo en un campo de selección o elimínalo para poder guardar.';
    }
    return null;
  }
  if (s.type === 'select' || s.type === 'multiselect') {
    const opts = s.options.map(sanitizeOption).filter(Boolean);
    if (opts.length < 2) return 'Agrega al menos 2 opciones.';
    if (new Set(opts).size !== opts.length) return 'Hay opciones repetidas.';
  }
  if (s.type === 'scale' && !(Number.isInteger(s.scale_min) && Number.isInteger(s.scale_max) && s.scale_min >= 0 && s.scale_min < s.scale_max)) {
    return 'La escala necesita un mínimo menor que el máximo (números enteros positivos).';
  }
  return null;
}

/** Ids of sections whose label collides with another (same server key). */
export function duplicateLabelIds(sections: BuilderSection[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const s of sections) {
    const label = s.type === 'widget' ? (s.widget ?? '') : sanitizeLabel(s.label);
    if (!label) continue;
    const key = s.type === 'widget' ? `widget:${s.widget}` : slugifyLabel(label);
    byKey.set(key, [...(byKey.get(key) ?? []), s.id]);
  }
  const dups = new Set<string>();
  for (const ids of byKey.values()) {
    if (ids.length > 1) ids.forEach((id) => dups.add(id));
  }
  return dups;
}

export function hasBuilderErrors(sections: BuilderSection[]): boolean {
  return sections.some((s) => sectionError(s) !== null) || duplicateLabelIds(sections).size > 0;
}

// ── Round-trip check & preview schema ────────────────────────────────────────

/** Builder state → SectionDef[] with client-derived keys, for the live preview. */
export function toPreviewSchema(sections: BuilderSection[]): SectionDef[] {
  const seen = new Map<string, number>();
  return sections.map((s) => {
    let key = slugifyLabel(sanitizeLabel(s.label));
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n > 0) key = `${key}_${n + 1}`; // keep React keys unique; validation flags the duplicate
    const def: SectionDef = {
      key,
      label: sanitizeLabel(s.label),
      required: s.required,
      collapsed: s.collapsed,
      type: s.type,
    };
    const hint = sanitizeHint(s.hint);
    if (hint) def.hint = hint;
    if (s.type === 'select' || s.type === 'multiselect') {
      def.options = s.options.map(sanitizeOption).filter(Boolean);
      if (s.pills) def.display = 'pills';
    }
    if (s.type === 'multiselect' && s.allow_other) def.allow_other = true;
    if (s.type === 'scale') {
      def.scale_min = s.scale_min;
      def.scale_max = s.scale_max;
    }
    if (s.type === 'widget') def.widget = s.widget;
    return def;
  });
}

/**
 * True when the server-parsed schema matches the builder state field by
 * field — the fail-closed gate before saving from visual mode.
 */
export function sectionsMatch(builder: BuilderSection[], parsed: SectionDef[]): boolean {
  if (builder.length !== parsed.length) return false;
  return builder.every((b, i) => {
    const p = parsed[i];
    if (p.type !== b.type) return false;
    if (p.label !== sanitizeLabel(b.label)) return false;
    if ((p.hint ?? '') !== sanitizeHint(b.hint)) return false;
    if (p.required !== b.required || p.collapsed !== b.collapsed) return false;
    if (b.type === 'select' || b.type === 'multiselect') {
      const opts = b.options.map(sanitizeOption).filter(Boolean);
      const pOpts = p.options ?? [];
      if (opts.length !== pOpts.length || opts.some((o, j) => o !== pOpts[j])) return false;
      if ((p.display === 'pills') !== b.pills) return false;
    }
    if (b.type === 'multiselect' && (p.allow_other ?? false) !== b.allow_other) return false;
    if (b.type === 'scale' && (p.scale_min !== b.scale_min || p.scale_max !== b.scale_max)) return false;
    if (b.type === 'widget' && p.widget !== b.widget) return false;
    return true;
  });
}
