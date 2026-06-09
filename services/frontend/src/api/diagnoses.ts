import { api } from './client';

export type DiagnosisType = 'PRINCIPAL' | 'RELATED';
export type DiagnosisStatus = 'ACTIVE' | 'RESOLVED' | 'RULED_OUT';

export interface ICD10Code {
  code: string;
  description: string;
  chapter: string;
}

export interface Diagnosis {
  id: string;
  patient_id: string;
  staff_id: string;
  clinical_record_id?: string;
  icd10_code: string;
  description: string;
  diagnosis_type: DiagnosisType;
  status: DiagnosisStatus;
  diagnosed_at: string;
  resolved_at?: string;
  created_at: string;
}

export const diagnosesApi = {
  searchIcd10: (q: string) =>
    api.get<{ items: ICD10Code[] }>(`/icd10?q=${encodeURIComponent(q)}`),
  list: (patientId: string) =>
    api.get<{ items: Diagnosis[] }>(`/patients/${patientId}/diagnoses`),
  create: (patientId: string, body: { icd10_code: string; diagnosis_type?: DiagnosisType; diagnosed_at?: string; clinical_record_id?: string }) =>
    api.post<{ id: string }>(`/patients/${patientId}/diagnoses`, body),
  updateStatus: (id: string, status: DiagnosisStatus) =>
    api.patch<void>(`/diagnoses/${id}`, { status }),
};
