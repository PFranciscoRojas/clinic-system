import { api } from './client';

export type AppointmentModality = 'IN_PERSON' | 'VIDEO_CALL' | 'PHONE_CALL';
export type AppointmentStatus   = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Appointment {
  id: string;
  organization_id: string;
  patient_id: string;
  staff_id: string;
  scheduled_at: string;
  duration_min: number;
  modality: AppointmentModality;
  status: AppointmentStatus;
  location_or_link?: string | null;
  notes?: string | null;
  rescheduled_to?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  created_at: string;
}

export interface CreateAppointmentBody {
  patient_id: string;
  scheduled_at: string;
  duration_min?: number;
  modality?: AppointmentModality;
  location_or_link?: string;
  notes?: string;
}

export const appointmentsApi = {
  list: (params?: {
    patient_id?: string; staff_id?: string; status?: string;
    date_from?: string; date_to?: string; limit?: number; offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.patient_id) q.set('patient_id', params.patient_id);
    if (params?.staff_id)   q.set('staff_id', params.staff_id);
    if (params?.status)     q.set('status', params.status);
    if (params?.date_from)  q.set('date_from', params.date_from);
    if (params?.date_to)    q.set('date_to', params.date_to);
    if (params?.limit)      q.set('limit', String(params.limit));
    if (params?.offset)     q.set('offset', String(params.offset));
    return api.get<Appointment[]>(`/appointments?${q}`);
  },

  get: (id: string) => api.get<Appointment>(`/appointments/${id}`),

  create: (body: CreateAppointmentBody) => api.post<{ id: string }>('/appointments', body),

  cancel: (id: string, reason: string) =>
    api.delete<void>(`/appointments/${id}`, { reason }),

  uploadAudio: (appointmentId: string, patientId: string, file: File) => {
    const form = new FormData();
    form.append('audio', file);
    form.append('patient_id', patientId);
    return api.upload<{ draft_id: string }>(`/appointments/${appointmentId}/audio`, form);
  },
};
