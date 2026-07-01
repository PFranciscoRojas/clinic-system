import { api } from './client';

export type PlanStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
export type GoalStatus = 'PENDING' | 'IN_PROGRESS' | 'ACHIEVED' | 'ABANDONED';

export interface TreatmentGoal {
  id: string;
  description: string;
  progress_notes: string;
  status: GoalStatus;
  target_date?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlan {
  id: string;
  patient_id: string;
  staff_id: string;
  status: PlanStatus;
  title: string;
  start_date: string;
  end_date?: string | null;
  goals: TreatmentGoal[];
  created_at: string;
  updated_at: string;
}

export interface CreatePlanInput {
  title: string;
  start_date: string;
  goals?: { description: string; target_date?: string }[];
}

export interface UpdateGoalInput {
  description?: string;
  progress_notes?: string;
  status?: GoalStatus;
  target_date?: string;
}

export const treatmentPlansApi = {
  list: (patientId: string, reason?: string) =>
    api.get<{ items: TreatmentPlan[] }>(`/patients/${patientId}/treatment-plans`,
      reason ? { headers: { 'X-Access-Reason': reason } } : undefined),
  create: (patientId: string, body: CreatePlanInput) =>
    api.post<{ id: string }>(`/patients/${patientId}/treatment-plans`, body),
  update: (planId: string, body: { title?: string; status?: PlanStatus }) =>
    api.patch<void>(`/treatment-plans/${planId}`, body),
  addGoal: (planId: string, body: { description: string; target_date?: string }) =>
    api.post<{ id: string }>(`/treatment-plans/${planId}/goals`, body),
  updateGoal: (planId: string, goalId: string, body: UpdateGoalInput) =>
    api.patch<void>(`/treatment-plans/${planId}/goals/${goalId}`, body),
  deleteGoal: (planId: string, goalId: string) =>
    api.delete<void>(`/treatment-plans/${planId}/goals/${goalId}`),
};
