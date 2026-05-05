import { api } from './client';

export interface Patient {
  id: string;
  document_type_id: string;
  document_number: string;
  first_name: string;
  middle_name?: string | null;
  paternal_last_name: string;
  maternal_last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  notes?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreatePatientBody {
  document_type_id: string;
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
}

export const patientsApi = {
  search: (params: { q?: string; last_name?: string; document?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.q)          q.set('q', params.q);
    if (params.last_name)  q.set('last_name', params.last_name);
    if (params.document)   q.set('document', params.document);
    if (params.limit)      q.set('limit', String(params.limit));
    if (params.offset)     q.set('offset', String(params.offset));
    return api.get<Patient[]>(`/patients?${q}`);
  },

  get: (id: string) => api.get<Patient>(`/patients/${id}`),

  create: (body: CreatePatientBody) => api.post<{ id: string }>('/patients', body),

  update: (id: string, body: Partial<CreatePatientBody>) => api.put<void>(`/patients/${id}`, body),

  deactivate: (id: string) => api.delete<void>(`/patients/${id}`),
};
