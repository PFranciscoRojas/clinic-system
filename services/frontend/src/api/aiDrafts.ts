import { api } from './client';

export type DraftStatus = 'PENDING' | 'PROCESSING' | 'DRAFT_READY' | 'APPROVED' | 'REJECTED' | 'ERROR';

export interface AIDraft {
  id: string;
  organization_id: string;
  patient_id: string;
  appointment_id?: string;
  status: DraftStatus;
  /** Set once the draft is APPROVED — the clinical record it became. */
  clinical_record_id?: string;
  ai_model_version: string;
  whisper_model: string;
  /** Optional custom template used when the recording was initiated. */
  template_id?: string;
  /** Draft shape: { record_type, sections: {...} }. */
  draft_content_plain?: Record<string, unknown> | null;
  /** Whisper transcription — always available once processed, even if sections are empty. */
  transcription?: string;
  error_message?: string;
  processed_at?: string;
  resolved_at?: string;
  created_at: string;
}

export interface ApproveDraftInput {
  sections?: Record<string, unknown>;
  session_date?: string;
  record_type?: string;
  appointment_id?: string;
  risk_level?: string;
  template_id?: string;
}

export interface DraftMeta {
  id: string;
  status: DraftStatus;
  patient_id: string;
  patient_code: number | null;
  appointment_id?: string;
  clinical_record_id?: string;
  created_at: string;
}

export const aiDraftsApi = {
  list:    (status?: DraftStatus) => {
    const q = status ? `?status=${status}` : '';
    return api.get<{ items: DraftMeta[] }>(`/ai-drafts${q}`).then(r => r.items ?? []);
  },
  get:     (id: string) => api.get<AIDraft>(`/ai-drafts/${id}`),
  approve: (id: string, body: ApproveDraftInput) =>
    api.post<{ clinical_record_id: string }>(`/ai-drafts/${id}/approve`, body),
  // Marks the draft approved and links it to an already-finalized clinical
  // record (the comparison view finalizes the manual record separately).
  link: (id: string, clinical_record_id: string) =>
    api.post<void>(`/ai-drafts/${id}/link`, { clinical_record_id }),
};
