import { api } from './client';
import { RecordType } from './clinicalRecords';

export type FieldType = 'text' | 'select' | 'multiselect' | 'scale' | 'checklist' | 'widget';
export type TemplateStatus = 'ACTIVE' | 'ARCHIVED';

/** One section parsed from the markdown template. */
export interface SectionDef {
  key: string;
  label: string;
  hint?: string;
  required: boolean;
  collapsed: boolean; // starts hidden behind an accordion
  type: FieldType;
  options?: string[];    // for type=select|multiselect
  display?: 'pills';     // for type=select|multiselect: render as toggle pill buttons
  allow_other?: boolean; // for type=multiselect: lets the professional add a free-text value
  scale_min?: number;    // for type=scale
  scale_max?: number;    // for type=scale
  widget?: string;       // for type=widget (name from field-widgets.json)
}

export interface RecordTemplate {
  id: string;
  name: string;
  record_type: RecordType;
  source_markdown: string;
  schema: SectionDef[];
  version: number;
  status: TemplateStatus;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ParsePreviewResult {
  suggested_name: string;
  sections: SectionDef[];
}

export const recordTemplatesApi = {
  /** List active templates for the org, optionally filtered by record_type. */
  list: (recordType?: RecordType) => {
    const q = recordType ? `?record_type=${recordType}` : '';
    return api.get<{ items: RecordTemplate[] }>(`/record-templates${q}`).then(r => r.items ?? []);
  },

  get: (id: string) => api.get<RecordTemplate>(`/record-templates/${id}`),

  /** Create a new template from markdown. */
  create: (body: {
    name?: string;
    record_type: RecordType;
    markdown: string;
    is_default?: boolean;
  }) => api.post<RecordTemplate>('/record-templates', body),

  /** Update name and/or markdown (increments version). */
  update: (id: string, body: { name?: string; markdown: string }) =>
    api.put<RecordTemplate>(`/record-templates/${id}`, body),

  /** Archive a template (soft delete — linked records still reference it). */
  archive: (id: string) => api.post<void>(`/record-templates/${id}/archive`, {}),

  /** Mark this template as the default for its record_type. */
  setDefault: (id: string) => api.post<{ id: string }>(`/record-templates/${id}/default`, {}),

  /** Parse markdown server-side for live preview — does not persist anything. */
  parse: (markdown: string) =>
    api.post<ParsePreviewResult>('/record-templates/parse', { markdown }),
};
