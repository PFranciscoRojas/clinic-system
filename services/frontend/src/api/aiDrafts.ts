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

export const aiDraftsApi = {
  get: (id: string) => api.get<AIDraft>(`/ai-drafts/${id}`),
};
