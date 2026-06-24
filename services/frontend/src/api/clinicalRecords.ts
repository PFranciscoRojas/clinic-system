import { api } from './client';

export type RecordType = 'INITIAL' | 'EVOLUTION' | 'DISCHARGE' | 'INTERCONSULTATION';
export type RecordStatus = 'DRAFT' | 'APPROVED';
export type RiskLevel = 'NONE' | 'IDEATION' | 'PLAN' | 'ATTEMPT';
export type DischargeReason = 'THERAPEUTIC_DISCHARGE' | 'DROPOUT' | 'REFERRAL' | 'MUTUAL_AGREEMENT';

export type MentalExamEntry = { status: 'NORMAL' | 'ALTERED'; note?: string };
// Sections can hold strings, numbers (distress_level), string arrays (task_checklist,
// session_axis), or structured objects (spa_history, clinical_formulation, etc.).
export type RecordSections = Record<string, string | number | boolean | string[] | Record<string, unknown>>;
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
  patient_code: number | null;
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
  sections?: RecordSections;
  risk_level?: RiskLevel;
  discharge_reason?: DischargeReason;
  supervisor_id?: string;
}

export interface UpdateRecordInput {
  sections?: RecordSections;
  risk_level?: RiskLevel;
  discharge_reason?: DischargeReason;
}

export interface Addendum {
  id: string;
  record_id: string;
  created_by: string;
  author_name: string;
  content: string;
  created_at: string;
}

export const clinicalRecordsApi = {
  listAll:   (status?: string) => {
    const q = status ? `?status=${status}` : '';
    return api.get<{ items: RecordMeta[] }>(`/clinical-records${q}`).then(r => r.items ?? []);
  },
  list:      (patientId: string) => api.get<{ items: RecordMeta[] }>(`/patients/${patientId}/records`),
  get:       (id: string)        => api.get<ClinicalRecord>(`/clinical-records/${id}`),
  create:    (patientId: string, body: CreateRecordInput) =>
    api.post<{ id: string }>(`/patients/${patientId}/records`, body),
  update:    (id: string, body: UpdateRecordInput) =>
    api.patch<void>(`/clinical-records/${id}`, body),
  approve:   (id: string) =>
    api.post<void>(`/clinical-records/${id}/approve`, {}),
  cosign:    (id: string) =>
    api.post<void>(`/clinical-records/${id}/cosign`, {}),
  listAddenda: (id: string) => api.get<{ items: Addendum[] }>(`/clinical-records/${id}/addenda`),
  addAddendum: (id: string, content: string) =>
    api.post<{ id: string }>(`/clinical-records/${id}/addenda`, { content }),
  exportPDF: async (id: string): Promise<Blob> => {
    const res = await fetch(`/api/v1/clinical-records/${id}/export`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to export PDF: ${res.statusText}`);
    }
    return res.blob();
  },
};

export interface ConsentTemplate {
  id: string;
  consent_type: ConsentType;
  version: number;
  title: string;
  body: string;
  created_at: string;
}

export interface ConsentEvidence {
  accepted_at: string;
  channel: string;
  ip?: string;
  user_agent?: string;
}

export interface ConsentDocument {
  id: string;
  patient_id: string;
  consent_type: ConsentType;
  signing_method: string;
  signed_at: string;
  revoked_at: string | null;
  template_id: string;
  document_text?: string;
  signature_png?: string;
  scan_file_base64?: string;
  scan_file_type?: string;
  evidence?: string; // JSON string — parse to ConsentEvidence
}

export const consentsApi = {
  list:     (patientId: string) => api.get<{ items: Consent[] }>(`/patients/${patientId}/consents`),
  sign:     (patientId: string, body: { consent_type: ConsentType; accepted: boolean; signature_png: string }) =>
    api.post<{ id: string }>(`/patients/${patientId}/consents/sign`, body),
  upload:   (patientId: string, form: FormData) =>
    api.upload<{ id: string }>(`/patients/${patientId}/consents/upload`, form),
  sendLink: (patientId: string, body: { consent_type: ConsentType }) =>
    api.post<{ expires_at: string }>(`/patients/${patientId}/consents/send-link`, body),
  document: (consentId: string) => api.get<ConsentDocument>(`/consents/${consentId}/document`),
  revoke:   (consentId: string, reason: string) =>
    api.post<void>(`/consents/${consentId}/revoke`, { reason }),
};

export const consentTemplatesApi = {
  list:   () => api.get<{ items: ConsentTemplate[] }>(`/consent-templates`),
  update: (type: ConsentType, body: { title: string; body: string }) =>
    api.put<ConsentTemplate>(`/consent-templates/${type}`, body),
};

// Public (no auth) — consumed by the remote sign page at /sign/:token.
export interface PublicConsentInfo {
  patient_first_name: string;
  consent_type: ConsentType;
  title: string;
  body: string;
  expires_at: string;
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error ?? res.statusText) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const publicConsentsApi = {
  get: (token: string) => publicRequest<PublicConsentInfo>(`/public/consents/sign/${token}`),
  sign: (token: string, body: { accepted: boolean; signature_png: string }) =>
    publicRequest<{ id: string }>(`/public/consents/sign/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
