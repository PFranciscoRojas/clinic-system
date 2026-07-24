import { api } from './client';

export interface DayAvailability {
  date: string;    // YYYY-MM-DD
  slots: string[]; // ["09:00","09:30",…] local time (America/Bogota)
}

export interface LeadBookResult {
  when: string;     // formatted local date+time
  meet_url: string; // Google Meet link, may be empty
}

// Working-hours configuration of the lead agenda (singleton row).
export interface LeadAgendaSettings {
  active_days: string[];   // 'Lun'…'Dom'
  start_hour: string;      // 'HH:MM'
  end_hour: string;        // 'HH:MM'
  slot_step_min: number;   // spacing between offered slots
  duration_min: number;    // length of the call
  timezone: string;        // IANA, e.g. 'America/Bogota'
}

export interface LeadBooking {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  scheduled_at: string;
  duration_min: number;
  status: string;    // BOOKED | CANCELLED
  meet_url: string;
  created_at: string;
}

// Lead (sales) agenda API — no auth. Used by /agenda. Global, non-tenant.
export const leadBookingApi = {
  availability: (from: string, to: string) =>
    api.get<{ days: DayAvailability[]; duration_min: number; timezone: string }>(
      `/public/agenda/availability?from=${from}&to=${to}`,
    ),

  book: (body: { name: string; email: string; phone: string; message: string; date: string; time: string }) =>
    api.post<LeadBookResult>('/public/agenda/book', body),
};

// SYSTEM_ADMIN side of the lead agenda: working hours + booked calls.
export const leadBookingAdminApi = {
  getSettings: () => api.get<LeadAgendaSettings>('/admin/lead-bookings/settings'),

  updateSettings: (s: LeadAgendaSettings) =>
    api.put<LeadAgendaSettings>('/admin/lead-bookings/settings', s),

  list: () => api.get<{ bookings: LeadBooking[] }>('/admin/lead-bookings/'),
};
