import { api } from './client';

export interface DayAvailability {
  date: string;    // YYYY-MM-DD
  slots: string[]; // ["09:00","09:30",…] local time (America/Bogota)
}

export interface LeadBookResult {
  when: string;     // formatted local date+time
  meet_url: string; // Google Meet link, may be empty
}

// Lead (sales) agenda API — no auth. Used by /agenda. Global, non-tenant.
export const leadBookingApi = {
  availability: (from: string, to: string) =>
    api.get<{ days: DayAvailability[] }>(
      `/public/agenda/availability?from=${from}&to=${to}`,
    ),

  book: (body: { name: string; email: string; phone: string; message: string; date: string; time: string }) =>
    api.post<LeadBookResult>('/public/agenda/book', body),
};
