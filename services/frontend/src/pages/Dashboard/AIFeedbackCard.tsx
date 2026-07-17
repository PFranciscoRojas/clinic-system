import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { aiDraftsApi } from '@/api/aiDrafts';

// Spanish labels for the integrated-format section keys; custom-template keys
// fall back to a humanized version of the key itself.
const SECTION_LABELS: Record<string, string> = {
  subjective:        'Reporte subjetivo',
  objective:         'Observación clínica',
  assessment:        'Análisis',
  plan:              'Plan',
  evolution:         'Evolución',
  interventions:     'Intervenciones',
  patient_response:  'Respuesta del paciente',
  homework:          'Tareas',
  risk_note:         'Nota de riesgo',
  next_session_focus:'Foco próxima sesión',
};

function fieldLabel(key: string) {
  return SECTION_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

// Compact "how useful is the AI" block for the dashboard's side column.
// Metrics come from draft_feedback (numbers only, no clinical text).
export function AIFeedbackCard() {
  const { data } = useQuery({
    queryKey: ['ai-feedback-stats'],
    queryFn: () => aiDraftsApi.feedbackStats(),
    staleTime: 5 * 60_000,
  });

  if (!data) return null;

  const hasData = data.feedback_count > 0;
  const pctUnchanged = Math.round(data.avg_unchanged_ratio * 100);
  const topFields = data.top_edited_fields.slice(0, 3);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Sparkles size={13} color="var(--s500)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>Borradores IA</span>
      </div>

      {!hasData ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)', lineHeight: 1.5 }}>
          Aprueba borradores IA para ver aquí qué tanto del contenido queda tal cual y qué secciones editas más.
        </p>
      ) : (
        <div style={{ border: '1px solid var(--s200)', borderRadius: 9, background: '#fff', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal-d)' }}>{pctUnchanged}%</span>
            <span style={{ fontSize: 11.5, color: 'var(--s500)' }}>del contenido IA se aprueba sin cambios</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--s500)', marginTop: 6 }}>
            {data.feedback_count} aprobado{data.feedback_count !== 1 ? 's' : ''}
            {' · '}{data.clean_approvals} sin ediciones
            {data.drafts_rejected > 0 ? ` · ${data.drafts_rejected} rechazado${data.drafts_rejected !== 1 ? 's' : ''}` : ''}
          </div>
          {topFields.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--s100)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--s400)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                Secciones más editadas
              </div>
              {topFields.map(f => (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--s600)', padding: '2px 0' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fieldLabel(f.key)}</span>
                  <span style={{ color: 'var(--s400)', whiteSpace: 'nowrap' }}>{f.rewritten + f.minor} edicion{f.rewritten + f.minor !== 1 ? 'es' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
