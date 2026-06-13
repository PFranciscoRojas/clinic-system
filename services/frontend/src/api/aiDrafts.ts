import { api } from './client';

export type DraftStatus = 'PENDING' | 'PROCESSING' | 'DRAFT_READY' | 'APPROVED' | 'REJECTED' | 'ERROR';

export interface AIDraft {
  id: string;
  organization_id: string;
  patient_id: string;
  status: DraftStatus;
  ai_model_version: string;
  whisper_model: string;
  /** New drafts: { record_type, sections: {...} }. Legacy drafts: flat SOAP keys. */
  draft_content_plain?: Record<string, unknown> | null;
  /** Whisper transcription — always available once processed, even if sections are empty. */
  transcription?: string;
  error_message?: string;
  processed_at?: string;
  resolved_at?: string;
  created_at: string;
}

export interface ApproveDraftInput {
  sections?: Record<string, string>;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  session_date?: string;
  record_type?: string;
  appointment_id?: string;
  risk_level?: string;
}

export const aiDraftsApi = {
  get:     (id: string) => api.get<AIDraft>(`/ai-drafts/${id}`),
  approve: (id: string, body: ApproveDraftInput) =>
    api.post<{ clinical_record_id: string }>(`/ai-drafts/${id}/approve`, body),
};
