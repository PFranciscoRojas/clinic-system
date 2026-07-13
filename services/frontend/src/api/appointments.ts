import { api } from './client';

export type AppointmentModality = 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';
export type AppointmentStatus   = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'PENDING_PAYMENT';

export interface Appointment {
  id: string;
  organization_id: string;
  patient_id: string;           // '' when the slot was reserved with just a name
  guest_name?: string | null;   // set on guest reservations, cleared on assignment
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
  started_at?: string | null;   // set when the professional starts the session
  created_at: string;
  paid?: boolean;               // true when linked to a paid online booking
  paid_amount?: number;         // whole COP
  paid_currency?: string;       // e.g. "COP"
  payment_ref?: string;         // MercadoPago payment id
}

export interface CreateAppointmentBody {
  patient_id?: string;
  guest_name?: string;
  staff_id: string;
  scheduled_at: string;
  duration_min?: number;
  modality?: AppointmentModality;
  location_or_link?: string;
  notes?: string;
}

/** COMPLETED session still missing its finalized clinical record. */
export interface PendingNote {
  appointment_id: string;
  patient_id: string;
  scheduled_at: string;
  /** Latest active AI draft for the session ('' = none). */
  draft_status: '' | 'PENDING' | 'PROCESSING' | 'DRAFT_READY';
}

export const appointmentsApi = {
  pendingNotes: () =>
    api.get<{ items: PendingNote[] }>('/appointments/pending-notes').then(r => r.items ?? []),

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
    return api.get<{ appointments: Appointment[] }>(`/appointments?${q}`)
      .then(r => r.appointments ?? []);
  },

  get: (id: string) => api.get<Appointment>(`/appointments/${id}`),

  create: (body: CreateAppointmentBody) => api.post<{ id: string }>('/appointments', body),

  updateStatus: (id: string, status: AppointmentStatus) =>
    api.patch<void>(`/appointments/${id}/status`, { status }),

  assignPatient: (id: string, patientId: string) =>
    api.patch<void>(`/appointments/${id}/patient`, { patient_id: patientId }),

  cancel: (id: string, reason: string) =>
    api.delete<void>(`/appointments/${id}`, { reason }),

  uploadAudio: (appointmentId: string, patientId: string, file: File, recordType?: string, templateId?: string) => {
    const form = new FormData();
    form.append('audio', file);
    form.append('patient_id', patientId);
    if (recordType) form.append('record_type', recordType);
    if (templateId) form.append('template_id', templateId);
    return api.upload<{ draft_id: string }>(`/appointments/${appointmentId}/audio`, form);
  },

  availability: (from: string, to: string, modality: string) =>
    api.get<{ days: { date: string; slots: string[] }[] }>(
      `/me/availability?from=${from}&to=${to}&modality=${modality}`
    ),
};
