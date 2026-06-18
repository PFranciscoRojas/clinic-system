import { api } from './client';

export type SuggestionKind = 'recap' | 'treatment_plan';
export type SuggestionStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

/** Recap content shape (kind = 'recap'). */
export interface RecapContent {
  summary: string | null;
  last_session: string | null;
  pending_tasks: string | null;
  focus_points: string[];
  risk_flags: string | null;
}

/** Treatment-plan proposal content shape (kind = 'treatment_plan'). */
export interface TreatmentPlanContent {
  title: string | null;
  formulation: string | null;
  goals: Array<{ description: string; target_weeks: number | null }>;
}

export interface AISuggestion<C = Record<string, unknown>> {
  id?: string;
  kind?: SuggestionKind;
  status: SuggestionStatus;
  content?: C;
  error?: string;
  created_at?: string;
}

export const aiSuggestionsApi = {
  request: (patientId: string, kind: SuggestionKind) =>
    api.post<{ id: string; status: string }>(`/patients/${patientId}/ai/${kind}`, {}),
  latest: <C = Record<string, unknown>>(patientId: string, kind: SuggestionKind) =>
    api.get<AISuggestion<C>>(`/patients/${patientId}/ai/${kind}`),
};
