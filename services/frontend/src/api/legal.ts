import { api } from './client';

export interface LegalDoc {
  doc_type: string;
  version: string;
  body_md: string;
  published_at: string;
}

export const legalApi = {
  get: (type: 'terms' | 'privacy' | 'dpa') =>
    api.get<LegalDoc>(`/legal/documents/${type}`),

  publish: (type: 'terms' | 'privacy' | 'dpa', version: string, body_md: string) =>
    api.put<{ doc_type: string; version: string }>(`/admin/legal/${type}`, { version, body_md }),
};
