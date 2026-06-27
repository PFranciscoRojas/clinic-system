import { api } from './client';

// Patient email-reminder preferences (org-level).
export interface NotificationSettings {
  reminder_24h: boolean;
  reminder_2h: boolean;
}

// Per-tenant WhatsApp (Meta Cloud API) config. The access token is write-only:
// the server returns token_set instead of the value. Sending an empty
// access_token on save keeps the stored one.
export interface WhatsAppSettings {
  enabled: boolean;
  phone_number_id: string;
  waba_id: string;
  tpl_reminder_24h: string;
  tpl_reminder_2h: string;
  tpl_booking: string;
  lang: string;
  token_set: boolean;
}

export type WhatsAppSave = Omit<WhatsAppSettings, 'token_set'> & { access_token: string };

// Per-tenant booking payment config. The MP access token is write-only:
// the server returns token_set. Sending an empty access_token keeps the stored one.
export interface PaymentSettings {
  enabled: boolean;
  session_price: number;
  token_set: boolean;
  webhook_secret_set: boolean;
}

export type PaymentSave = Omit<PaymentSettings, 'token_set' | 'webhook_secret_set'> & {
  access_token: string;
  webhook_secret: string;
};

export const orgApi = {
  getNotifications: () => api.get<NotificationSettings>('/org/notifications'),
  saveNotifications: (s: NotificationSettings) => api.put<NotificationSettings>('/org/notifications', s),
  getWhatsApp: () => api.get<WhatsAppSettings>('/org/whatsapp'),
  saveWhatsApp: (s: WhatsAppSave) => api.put<WhatsAppSettings>('/org/whatsapp', s),
  getPayment: () => api.get<PaymentSettings>('/org/payment'),
  savePayment: (s: PaymentSave) => api.put<PaymentSettings>('/org/payment', s),
};
