import { api } from './client';

// In-app notification (the topbar bell). Copy is generic by design — no patient
// PII — and `link` points to the in-app route that loads the encrypted detail.
export interface Notification {
  id: string;
  kind: 'AI_DRAFT_READY' | 'NEW_PATIENT' | 'BOOKING_NEW' | 'BOOKING_CONFLICT' | string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export const notificationsApi = {
  list: (limit = 20) =>
    api.get<{ items: Notification[] }>(`/notifications?limit=${limit}`).then(r => r.items),
  unreadCount: () =>
    api.get<{ unread: number }>('/notifications/unread-count').then(r => r.unread),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<void>('/notifications/read-all', {}),
};
