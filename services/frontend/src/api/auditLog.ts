import { api } from './client';

export interface AuditEntry {
  id: number;
  occurred_at: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  success: boolean;
  error_code: string | null;
  actor_id: string | null;
  actor_name: string;
  actor_roles: string[];
  actor_email: string;
  ip_address: string | null;
  reason: string;
  patient_id: string | null;
  patient_name: string;
  is_self: boolean;
  session_date: string | null;
}

export interface AuditLogPage {
  items: AuditEntry[];
  limit: number;
  offset: number;
  /** True when the caller sees the whole organization (admin), not just their own team. */
  org_wide: boolean;
  has_more: boolean;
}

export interface AuditLogFilters {
  action?: string;
  resource_type?: string;
  patient_id?: string;
  from?: string;
  to?: string;
  only_mine?: boolean;
  limit?: number;
  offset?: number;
}

export const auditLogApi = {
  list: (f: AuditLogFilters = {}): Promise<AuditLogPage> => {
    const q = new URLSearchParams();
    if (f.action)        q.set('action', f.action);
    if (f.resource_type) q.set('resource_type', f.resource_type);
    if (f.patient_id)    q.set('patient_id', f.patient_id);
    if (f.from)          q.set('from', f.from);
    if (f.to)            q.set('to', f.to);
    if (f.only_mine)     q.set('only_mine', 'true');
    if (f.limit  != null) q.set('limit',  String(f.limit));
    if (f.offset != null) q.set('offset', String(f.offset));
    const qs = q.toString();
    return api.get<AuditLogPage>(`/audit-log${qs ? `?${qs}` : ''}`);
  },
};

/* Labels for the action codes the backend writes. An unmapped code falls back
 * to the raw string rather than being hidden: a trail with silent gaps is
 * worse than one with an ugly row in it. */
export const ACTION_LABELS: Record<string, string> = {
  'auth.login':                    'Inicio de sesión',
  RESOURCE_ACCESS_DENIED:          'Acceso denegado',
  CLINICAL_RECORD_READ:            'Abrió una historia clínica',
  CLINICAL_RECORD_LIST:            'Listó las historias de un paciente',
  CLINICAL_RECORD_CREATE:          'Creó una historia clínica',
  CLINICAL_RECORD_UPDATE:          'Editó una historia clínica',
  CLINICAL_RECORD_APPROVE:         'Firmó una historia clínica',
  CLINICAL_RECORD_COSIGN:          'Refrendó una historia clínica',
  CLINICAL_RECORD_ADDENDUM:        'Agregó una anotación posterior',
  CLINICAL_RECORD_EXPORT:          'Descargó una historia en PDF',
  CLINICAL_RECORD_BULK_EXPORT:     'Descargó el archivo completo',
  CONSENT_LIST:                    'Consultó los consentimientos',
  CONSENT_UPLOAD:                  'Subió un consentimiento',
  CONSENT_SIGN:                    'Registró la firma de un consentimiento',
  CONSENT_SIGN_REMOTE:             'Un paciente firmó en línea',
  CONSENT_SEND_LINK:               'Envió un enlace de firma',
  CONSENT_REVOKE:                  'Revocó un consentimiento',
  CONSENT_VIEW_DOCUMENT:           'Abrió un consentimiento',
  CONSENT_TEMPLATE_UPDATE:         'Editó una plantilla de consentimiento',
  DIAGNOSIS_LIST:                  'Consultó los diagnósticos',
  DIAGNOSIS_CREATE:                'Registró un diagnóstico',
  DIAGNOSIS_UPDATE:                'Modificó un diagnóstico',
  TREATMENT_PLAN_LIST:             'Consultó los planes de tratamiento',
  TREATMENT_PLAN_CREATE:           'Creó un plan de tratamiento',
  TREATMENT_PLAN_UPDATE:           'Modificó un plan de tratamiento',
  TREATMENT_GOAL_ADD:              'Agregó un objetivo terapéutico',
  TREATMENT_GOAL_UPDATE:           'Modificó un objetivo terapéutico',
  TREATMENT_GOAL_DELETE:           'Eliminó un objetivo terapéutico',
  PROFESSIONAL_PROFILE_UPSERT:     'Actualizó su perfil profesional',
  PROFESSIONAL_SIGNATURE_UPLOAD:   'Cargó su firma',
  PROFESSIONAL_SIGNATURE_DELETE:   'Eliminó su firma',
  PROFESSIONAL_AVATAR_UPLOAD:      'Cambió su foto',
  PROFESSIONAL_AVATAR_DELETE:      'Eliminó su foto',
  SCHEDULE_UPDATE:                 'Cambió su horario',
  AI_PREFS_UPDATE:                 'Cambió las preferencias de IA',
};

/* Actions worth putting in front of the user as a filter: the ones that
 * answer "who saw this" rather than "who configured that". */
export const AUDIT_FILTER_ACTIONS = [
  'CLINICAL_RECORD_READ',
  'CLINICAL_RECORD_EXPORT',
  'CLINICAL_RECORD_BULK_EXPORT',
  'CLINICAL_RECORD_UPDATE',
  'CLINICAL_RECORD_APPROVE',
  'RESOURCE_ACCESS_DENIED',
  'auth.login',
] as const;

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
