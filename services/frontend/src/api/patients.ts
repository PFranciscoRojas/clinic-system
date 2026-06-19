import { api } from './client';

export interface Patient {
  id: string;
  document_type_code: string;
  document_number: string;
  first_name: string;
  middle_name?: string;
  paternal_last_name: string;
  maternal_last_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  birth_date?: string;
  gender?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  is_active: boolean;
}

export interface CreatePatientBody {
  document_type_code: string;
  document_number: string;
  first_name: string;
  middle_name?: string;
  paternal_last_name: string;
  maternal_last_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  birth_date?: string;
  gender?: string;
  notes?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

export const patientsApi = {
  // List all patients paginated (no search filter)
  list: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit)  q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return api.get<{ patients: Patient[] }>(`/patients?${q}`)
      .then(r => r.patients ?? []);
  },

  // Search by exact paternal last name or exact document number
  search: (params: { last_name?: string; document?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.last_name) q.set('last_name', params.last_name);
    if (params.document)  q.set('document', params.document);
    if (params.limit)     q.set('limit', String(params.limit));
    if (params.offset)    q.set('offset', String(params.offset));
    return api.get<{ patients: Patient[] }>(`/patients?${q}`)
      .then(r => r.patients ?? []);
  },

  get: (id: string) => api.get<Patient>(`/patients/${id}`),

  create: (body: CreatePatientBody) => api.post<{ id: string }>('/patients', body),

  update: (id: string, body: Partial<CreatePatientBody>) => api.put<void>(`/patients/${id}`, body),

  deactivate: (id: string) => api.delete<void>(`/patients/${id}`),
};
