import { api } from './client';

export type DraftStatus = 'PENDING' | 'PROCESSING' | 'DRAFT_READY' | 'APPROVED' | 'REJECTED' | 'ERROR';

export interface AIDraft {
  id: string;
  organization_id: string;
  patient_id: string;
  status: DraftStatus;
  ai_model_version: string;
  whisper_model: string;
  draft_content_plain?: Record<string, string> | null;
  error_message?: string;
  processed_at?: string;
  resolved_at?: string;
  created_at: string;
}

export interface ApproveDraftInput {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  session_date?: string;
  record_type?: string;
  appointment_id?: string;
}

export const aiDraftsApi = {
  get:     (id: string) => api.get<AIDraft>(`/ai-drafts/${id}`),
  approve: (id: string, body: ApproveDraftInput) =>
    api.post<{ clinical_record_id: string }>(`/ai-drafts/${id}/approve`, body),
};
