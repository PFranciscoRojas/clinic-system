import { api } from './client';

export type RecordType = 'INITIAL' | 'EVOLUTION' | 'DISCHARGE' | 'INTERCONSULTATION';
export type RecordStatus = 'DRAFT' | 'APPROVED';
export type RiskLevel = 'NONE' | 'IDEATION' | 'PLAN' | 'ATTEMPT';
export type DischargeReason = 'THERAPEUTIC_DISCHARGE' | 'DROPOUT' | 'REFERRAL' | 'MUTUAL_AGREEMENT';

export type MentalExamEntry = { status: 'NORMAL' | 'ALTERED'; note?: string };
export type RecordSections = Record<string, string | Record<string, MentalExamEntry>>;
export type ConsentType = 'TREATMENT' | 'RECORDING' | 'DATA_PROCESSING' | 'INFORMATION_SHARING';

export interface ClinicalRecord {
  id: string;
  patient_id: string;
  responsible_staff_id: string;
  created_by: string;
  appointment_id: string;
  record_type: RecordType;
  session_date: string;
  template_version: number;
  sections?: RecordSections;
  risk_level?: RiskLevel;
  discharge_reason?: DischargeReason;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: RecordStatus;
  approved_at?: string;
  requires_cosign: boolean;
  supervisor_id: string;
  supervisor_cosigned_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RecordMeta {
  id: string;
  patient_id: string;
  responsible_staff_id: string;
  created_by: string;
  appointment_id: string;
  record_type: RecordType;
  session_date: string;
  template_version: number;
  risk_level?: RiskLevel;
  status: RecordStatus;
  requires_cosign: boolean;
  supervisor_id: string;
  created_at: string;
}

export interface Consent {
  id: string;
  patient_id: string;
  staff_id: string;
  consent_type: ConsentType;
  signing_method: string;
  signed_at: string;
  valid_until?: string;
  revoked_at?: string;
  created_at: string;
}

export interface CreateRecordInput {
  responsible_staff_id?: string;
  appointment_id?: string;
  record_type: RecordType;
  session_date: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  sections?: RecordSections;
  risk_level?: RiskLevel;
  discharge_reason?: DischargeReason;
  supervisor_id?: string;
}

export interface UpdateRecordInput {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  sections?: RecordSections;
  risk_level?: RiskLevel;
  discharge_reason?: DischargeReason;
}

export const clinicalRecordsApi = {
  list:    (patientId: string) => api.get<{ items: RecordMeta[] }>(`/patients/${patientId}/records`),
  get:     (id: string)        => api.get<ClinicalRecord>(`/clinical-records/${id}`),
  create:  (patientId: string, body: CreateRecordInput) =>
    api.post<{ id: string }>(`/patients/${patientId}/records`, body),
  update:  (id: string, body: UpdateRecordInput) =>
    api.patch<void>(`/clinical-records/${id}`, body),
  approve: (id: string) =>
    api.post<void>(`/clinical-records/${id}/approve`, {}),
  cosign:  (id: string) =>
    api.post<void>(`/clinical-records/${id}/cosign`, {}),
};

export const consentsApi = {
  list:   (patientId: string) => api.get<{ items: Consent[] }>(`/patients/${patientId}/consents`),
  create: (patientId: string, body: { consent_type: ConsentType; signed_at?: string; scan_file_type?: string }) =>
    api.post<{ id: string }>(`/patients/${patientId}/consents`, body),
};
