import { api } from './client';

export interface GoogleCalendarStatus {
  connected: boolean;
  google_email: string;
  calendar_id: string;
}

export const gcalApi = {
  status: () => api.get<GoogleCalendarStatus>('/me/google/status'),
  connectURL: () => api.get<{ auth_url: string }>('/me/google/connect'),
  sync: () => api.post<{ queued: number }>('/me/google/sync', {}),
  disconnect: () => api.delete<void>('/me/google'),
};
