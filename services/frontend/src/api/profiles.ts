import { api } from './client';

export interface Specialty {
  id: string;
  code: string;
  name: string;
}

export interface ProfessionalProfile {
  user_id: string;
  specialty_id: string;
  specialty_name: string;
  first_name: string;
  middle_name: string;
  paternal_last_name: string;
  maternal_last_name: string;
  license_number: string;
  phone: string;
  signature_png?: string; // data URL, present when a signature stamp is uploaded
}

export interface SaveProfileInput {
  first_name: string;
  middle_name?: string;
  paternal_last_name: string;
  maternal_last_name?: string;
  license_number: string;
  specialty_id: string;
  phone?: string;
}

export const profilesApi = {
  specialties: () => api.get<{ items: Specialty[] }>('/specialties'),
  get: () => api.get<ProfessionalProfile>('/me/professional-profile'),
  save: (body: SaveProfileInput) => api.put<{ status: string }>('/me/professional-profile', body),
  uploadSignature: (signaturePng: string) =>
    api.put<{ status: string }>('/me/professional-profile/signature', { signature_png: signaturePng }),
  deleteSignature: () =>
    api.delete<{ status: string }>('/me/professional-profile/signature'),
  getSchedule: () =>
    api.get<{ schedule: unknown }>('/me/professional-profile/schedule'),
  saveSchedule: (schedule: unknown) =>
    api.put<{ status: string }>('/me/professional-profile/schedule', { schedule }),
};

// splitName breaks a free-text name into (first, rest) on the first space —
// "Chapués Rodríguez" → paternal "Chapués", maternal "Rodríguez".
export function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  return [parts[0] ?? '', parts.slice(1).join(' ')];
}
