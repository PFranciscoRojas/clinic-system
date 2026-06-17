import { api } from './client';

// Patient email-reminder preferences (org-level). WhatsApp/SMS and internal
// alerts are a later wave and not represented here yet.
export interface NotificationSettings {
  reminder_24h: boolean;
  reminder_2h: boolean;
}

export const orgApi = {
  getNotifications: () => api.get<NotificationSettings>('/org/notifications'),
  saveNotifications: (s: NotificationSettings) => api.put<NotificationSettings>('/org/notifications', s),
};
