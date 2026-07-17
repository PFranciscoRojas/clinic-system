import { api } from './client';

export type DraftStatus = 'PENDING' | 'PROCESSING' | 'DRAFT_READY' | 'APPROVED' | 'REJECTED' | 'ERROR' | 'SUPERSEDED' | 'EMPTY';

export interface AIDraft {
  id: string;
  organization_id: string;
  patient_id: string;
  appointment_id?: string;
  status: DraftStatus;
  /** Set once the draft is APPROVED — the clinical record it became. */
  clinical_record_id?: string;
  /** Set when this take was folded into a later, consolidated draft. */
  superseded_by?: string;
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
  /** Required by the backend when record_type is DISCHARGE, any format. */
  discharge_reason?: string;
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

export interface FieldEditStat {
  key: string;
  rewritten: number;
  minor: number;
}

export interface ProfessionalEditStats {
  professional_id: string;
  drafts: number;
  avg_unchanged_ratio: number;
}

/** Aggregate of how much professionals edit AI drafts before approving. */
export interface DraftFeedbackStats {
  drafts_approved: number;
  drafts_rejected: number;
  feedback_count: number;
  clean_approvals: number;
  avg_unchanged_ratio: number;
  top_edited_fields: FieldEditStat[];
  by_professional: ProfessionalEditStats[];
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
  feedbackStats: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const qs = q.toString();
    return api.get<DraftFeedbackStats>(`/ai-drafts/feedback/stats${qs ? `?${qs}` : ''}`);
  },
};
