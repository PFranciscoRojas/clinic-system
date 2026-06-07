import { api } from './client';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export interface BookingRequest {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  modality: 'IN_PERSON' | 'VIRTUAL';
  preferred_date?: string;
  preferred_time?: string;
  notes?: string;
  status: BookingStatus;
  staff_note?: string;
  created_at: string;
  resolved_at?: string;
}

export interface CreateBookingInput {
  org_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  modality: 'IN_PERSON' | 'VIRTUAL';
  preferred_date?: string;
  preferred_time?: string;
  notes?: string;
}

// Public — no auth required. Uses fetch directly to avoid sending Authorization header.
export const publicBookingApi = {
  create: (body: CreateBookingInput): Promise<{ id: string }> =>
    fetch(`/api/v1/public/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async r => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }),
};

// Private — requires auth
export const bookingRequestsApi = {
  list: (status?: BookingStatus) => {
    const q = status ? `?status=${status}` : '';
    return api.get<{ items: BookingRequest[] }>(`/booking-requests${q}`)
      .then(r => r.items ?? []);
  },
  count: () => api.get<{ count: number }>('/booking-requests/count').then(r => r.count),
  confirm: (id: string, staffNote?: string, patient?: {
    document_type_code?: string;
    document_number?: string;
    birth_date?: string;
    gender?: string;
  }) =>
    api.post<void>(`/booking-requests/${id}/confirm`, {
      staff_note: staffNote ?? null,
      patient: patient ?? null,
    }),
  reject: (id: string, staffNote?: string) =>
    api.post<void>(`/booking-requests/${id}/reject`, { staff_note: staffNote ?? null }),
};
