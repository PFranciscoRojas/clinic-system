import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Brain, Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Edit3, Save, ChevronDown, ChevronUp, Sparkles, FileText, Stethoscope, Search, X,
} from 'lucide-react';
import { aiDraftsApi, type DraftStatus } from '@/api/aiDrafts';
import { useIsMobile } from '@/lib/useMediaQuery';
import { diagnosesApi, type ICD10Code } from '@/api/diagnoses';
import { recordTemplatesApi } from '@/api/recordTemplates';
import type { RecordSections } from '@/api/clinicalRecords';
import { TEMPLATE_SECTIONS, RECORD_TYPE_LABELS, type SectionDef } from '@/components/clinical/constants';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import TemplatedSectionsForm, { type SectionsState } from '@/components/clinical/TemplatedSectionsForm';

const STATUS_CONFIG: Record<DraftStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PENDING:      { label: 'En cola',        color: '#6b7280', bg: '#f3f4f6', Icon: Clock        },
  PROCESSING:   { label: 'Procesando',     color: '#0369a1', bg: '#e0f2fe', Icon: RefreshCw    },
  DRAFT_READY:  { label: 'Listo',          color: '#065f46', bg: '#d1fae5', Icon: CheckCircle2 },
  APPROVED:     { label: 'Aprobado',       color: '#fff',    bg: '#059669', Icon: CheckCircle2 },
  REJECTED:     { label: 'Rechazado',      color: '#92400e', bg: '#fef3c7', Icon: AlertTriangle },
  ERROR:        { label: 'Error',          color: '#991b1b', bg: '#fee2e2', Icon: AlertTriangle },
};


export function AIDraftPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // Session context passed by the appointment page so the approved record
  // lands linked to the right appointment, date and record type.
  const qsAppointmentId = params.get('appointment_id') ?? '';
  const qsSessionDate   = params.get('session_date') ?? '';
  const qsRecordType    = params.get('record_type') ?? '';
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  // All sections start open — collapsing is the exception
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draftEdit, setDraftEdit] = useState<Record<string, string>>({});
  // State for custom-template mode (typed sections, not just strings)
  const [customEdit, setCustomEdit] = useState<SectionsState>({});
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState('');
  const [createdRecordId, setCreatedRecordId] = useState('');
  // Lets the professional correct the record type before approving
  const [showTranscript, setShowTranscript] = useState(false);
  // ICD-10 to assign on approve — seeded from the AI suggestion, confirmable.
  // undefined = not yet initialised from the draft; null = explicitly removed.
  const [icd10, setIcd10] = useState<ICD10Code | null | undefined>(undefined);

  const { data: draft, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-draft', id],
    queryFn: () => aiDraftsApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === 'PENDING' || status === 'PROCESSING') ? 3000 : false;
    },
  });

  // Load the custom template schema when the draft was created with one
  const { data: customTemplate } = useQuery({
    queryKey: ['record-template', draft?.template_id],
    queryFn: () => recordTemplatesApi.get(draft!.template_id!),
    enabled: !!draft?.template_id,
  });

  // Seed customEdit from draft content when using a custom template
  useEffect(() => {
    if (!customTemplate || !draft) return;
    const raw = draft.draft_content_plain as Record<string, unknown> | null;
    const sections = (raw?.sections ?? {}) as RecordSections;
    setCustomEdit(sections);
  }, [customTemplate, draft]);

  // Seed the ICD-10 selector from the AI suggestion once, when the draft loads
  useEffect(() => {
    if (icd10 !== undefined) return;
    const sug = (draft?.draft_content_plain as Record<string, unknown> | null)?.suggested_icd10 as
      | { code?: string; description?: string } | null | undefined;
    if (sug && typeof sug.code === 'string' && sug.code.trim()) {
      setIcd10({ code: sug.code.trim(), description: sug.description ?? '', chapter: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const handleApprove = async () => {
    if (!id) return;
    setApproving(true);
    setApproveErr('');
    try {
      let approveBody: Parameters<typeof aiDraftsApi.approve>[1];
      if (customTemplate) {
        // Custom template path: send typed sections as-is
        approveBody = {
          sections: customEdit,
          record_type: recordType,
          session_date: qsSessionDate || undefined,
          appointment_id: qsAppointmentId || undefined,
          template_id: customTemplate.id,
        };
      } else {
        // Integrated format path: text-only sections
        const finalSections: Record<string, string> = {};
        for (const def of sectionDefs) {
          const v = (draftEdit[def.key] ?? baseContent[def.key] ?? '').trim();
          if (v) finalSections[def.key] = v;
        }
        approveBody = {
          sections: finalSections,
          record_type: recordType,
          session_date: qsSessionDate || undefined,
          appointment_id: qsAppointmentId || undefined,
        };
      }
      const res = await aiDraftsApi.approve(id, approveBody);
      setCreatedRecordId(res.clinical_record_id);
      // Assign the confirmed diagnosis (if any) to the new record
      if (icd10?.code && draft?.patient_id) {
        try {
          await diagnosesApi.create(draft.patient_id, {
            icd10_code: icd10.code,
            clinical_record_id: res.clinical_record_id,
            diagnosis_type: 'PRINCIPAL',
          });
        } catch { /* record is approved; diagnosis can be added later from the profile */ }
      }
      queryClient.invalidateQueries({ queryKey: ['ai-draft', id] });
    } catch {
      setApproveErr('Error al aprobar. Intenta de nuevo.');
    } finally {
      setApproving(false);
    }
  };

  const toggleSection = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={28} color="var(--teal)" /></div>;
  }

  if (isError || !draft) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 24 }}>
        <AlertTriangle size={16} /> Borrador no encontrado
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[draft.status];
  const isPending = draft.status === 'PENDING' || draft.status === 'PROCESSING';
  const isReady = draft.status === 'DRAFT_READY';

  // While the template schema is loading (async), don't show phantom integrated fields.
  const templateLoading = !!draft.template_id && !customTemplate;

  const contentRaw = draft.draft_content_plain as Record<string, unknown> | null;
  // Drafts carry the clinical-record sections for the record type.
  const recordType = (qsRecordType || (contentRaw?.record_type as string) || 'EVOLUTION') as keyof typeof TEMPLATE_SECTIONS;
  const transcription = (draft.transcription ?? '').trim();
  const baseContent: Record<string, string> = (contentRaw?.sections as Record<string, string>) ?? {};
  const sectionDefs: { key: string; label: string; description: string }[] =
    (TEMPLATE_SECTIONS[recordType] ?? TEMPLATE_SECTIONS.EVOLUTION).map((d: SectionDef) => ({ key: d.key, label: d.label, description: d.placeholder }));
  // Whether to render with the data-driven template form or the plain-text form
  const useCustomTemplate = !!customTemplate;

  // True when there is genuinely no AI content and the professional has not
  // added any manual content either — shows a clean "empty draft" state.
  const isEmptyDraft = isReady && !editing && !useCustomTemplate
    && sectionDefs.every(({ key }) => !getDraftField(key).trim());

  const getDraftField = (key: string) => draftEdit[key] ?? baseContent[key] ?? '';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '0 12px 32px' : 0 }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: 0 }}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      {/* Header */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Brain size={24} color="#f59e0b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>Borrador IA</h1>
              <Badge label={statusCfg.label} color={statusCfg.color} bg={statusCfg.bg} />
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <InfoLine label="Tipo" value={RECORD_TYPE_LABELS[recordType] ?? recordType} />
              <InfoLine label="Modelo" value={draft.ai_model_version ?? '—'} />
              <InfoLine label="Draft ID" value={id?.slice(-8) ?? '—'} />
            </div>
          </div>
          {isReady && !editing && (
            <button
              onClick={() => setEditing(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              <Edit3 size={14} /> Editar
            </button>
          )}
        </div>
      </div>

      {/* Processing state */}
      {isPending && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: '#e0f2fe', marginBottom: 20 }}>
            <Spinner size={28} color="#0369a1" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>
            {draft.status === 'PENDING' ? 'En cola de procesamiento' : 'Generando borrador…'}
          </h2>
          <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 20px' }}>
            {draft.status === 'PENDING'
              ? 'El audio está esperando ser transcrito por Whisper'
              : 'Whisper está transcribiendo el audio y el modelo IA está generando el borrador'}
          </p>
          <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto', padding: '8px 16px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={14} /> Actualizar estado
          </button>
          <p style={{ color: 'var(--s300)', fontSize: 12, marginTop: 12 }}>Se actualiza automáticamente cada 3 segundos</p>
        </div>
      )}

      {/* Error state */}
      {draft.status === 'ERROR' && (
        <div className="card" style={{ padding: 32, textAlign: 'center', border: '1.5px solid #fecaca' }}>
          <AlertTriangle size={40} color="#ef4444" style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>Error en el procesamiento</h2>
          <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 20px' }}>El pipeline de IA encontró un error. Contacta al administrador con el Draft ID.</p>
        </div>
      )}

      {/* Template schema loading — avoid showing phantom integrated-format fields */}
      {(isReady || draft.status === 'APPROVED') && templateLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spinner size={24} color="var(--teal)" />
        </div>
      )}

      {/* Draft content */}
      {(isReady || draft.status === 'APPROVED') && !templateLoading && (
        <>
          {/* Empty draft with no user edits: skip the form entirely, show a clean state */}
          {isEmptyDraft ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <AlertTriangle size={32} color="#d97706" style={{ marginBottom: 12 }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>
                Sin contenido clínico detectado
              </h2>
              <p style={{ color: 'var(--s500)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
                {transcription
                  ? 'La IA transcribió el audio pero no encontró contenido clínico para estructurar. Revisa la transcripción abajo.'
                  : 'La IA no encontró contenido clínico en este audio. Puedes redactar el registro manualmente.'}
              </p>
              <button
                onClick={() => setEditing(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                <Edit3 size={15} /> Redactar manualmente
              </button>
              {transcription && (
                <div className="card" style={{ padding: 0, marginTop: 20, overflow: 'hidden', textAlign: 'left' }}>
                  <button
                    onClick={() => setShowTranscript(v => !v)}
                    style={{ width: '100%', padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
                      <FileText size={14} color="var(--s400)" /> Transcripción del audio
                    </span>
                    {showTranscript ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
                  </button>
                  {showTranscript && (
                    <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--s100)' }}>
                      <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--s600)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcription}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
          <>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16,
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
            padding: '11px 14px',
          }}>
            <Sparkles size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12.5, color: '#78350f', lineHeight: 1.65 }}>
              <strong>Borrador generado por IA.</strong> Este texto es una sugerencia elaborada a partir de
              texto anonimizado. La responsabilidad clínica, diagnóstica y terapéutica es exclusiva del
              profesional habilitado. Revisa, edita y aprueba antes de incorporarlo a la historia clínica
              (Ley 23/1981 · Res. 1995/1999).
            </p>
          </div>

          {/* Transcription — always available once processed, even if the
              sections are empty, so the professional can confirm what was heard */}
          {transcription && (
            <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
              <button
                onClick={() => setShowTranscript(v => !v)}
                style={{ width: '100%', padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
                  <FileText size={14} color="var(--s400)" /> Transcripción del audio
                </span>
                {showTranscript ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
              </button>
              {showTranscript && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--s100)' }}>
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--s600)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcription}</p>
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            {useCustomTemplate ? (
              /* Custom template — data-driven form with typed fields and existing widgets */
              <div className="card" style={{ padding: '20px 24px' }}>
                {customTemplate?.name && (
                  <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--s400)', fontStyle: 'italic' }}>
                    Formato: <strong>{customTemplate.name}</strong>
                  </p>
                )}
                <TemplatedSectionsForm
                  schema={customTemplate!.schema}
                  value={customEdit}
                  onChange={setCustomEdit}
                  disabled={!editing}
                  patientId={draft.patient_id}
                />
              </div>
            ) : (
              /* Integrated format — collapsible text sections */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sectionDefs.map(({ key, label, description }) => {
                  const isOpen = !collapsed.has(key);
                  return (
                    <div key={key} className="card" style={{ overflow: 'hidden', padding: 0 }}>
                      <button
                        onClick={() => toggleSection(key)}
                        style={{
                          width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>{label}</p>
                          {!isOpen && <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{description}</p>}
                        </div>
                        {isOpen ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--s100)' }}>
                          <p style={{ fontSize: 12, color: 'var(--s400)', margin: '12px 0 10px', fontStyle: 'italic' }}>{description}</p>
                          {editing ? (
                            <textarea
                              value={getDraftField(key)}
                              onChange={e => setDraftEdit(prev => ({ ...prev, [key]: e.target.value }))}
                              rows={6}
                              style={{
                                width: '100%', padding: '12px 14px', borderRadius: 10,
                                border: '1.5px solid var(--teal)', fontSize: 14, color: 'var(--s700)',
                                resize: 'vertical', background: '#fff', boxSizing: 'border-box',
                                lineHeight: 1.7,
                              }}
                            />
                          ) : (
                            <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                              {getDraftField(key) || <em style={{ color: 'var(--s300)' }}>Sin contenido</em>}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ICD-10 suggestion — the AI proposes, the professional confirms */}
          {(isReady || draft.status === 'APPROVED') && (
            <Icd10Suggestion
              value={icd10 ?? null}
              editable={isReady}
              onChange={setIcd10}
            />
          )}

          {/* Action bar */}
          {isReady && (
            <div style={{ display: 'flex', gap: 12 }}>
              {editing ? (
                <>
                  <button
                    onClick={() => { setDraftEdit({}); setEditing(false); }}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}
                  >
                    Descartar cambios
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Save size={16} /> Listo
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Edit3 size={16} /> Editar borrador
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    style={{ flex: 2, padding: 13, borderRadius: 11, background: 'var(--teal)', color: '#fff', border: 'none', cursor: approving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: approving ? 0.7 : 1 }}
                  >
                    {approving ? <Spinner size={16} color="#fff" /> : <CheckCircle2 size={16} />}
                    {approving ? 'Aprobando…' : 'Aprobar historia clínica'}
                  </button>
                </>
              )}
            </div>
          )}

          {approveErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fee2e2', borderRadius: 10, border: '1.5px solid #fca5a5', marginTop: 8 }}>
              <AlertTriangle size={15} color="#dc2626" />
              <span style={{ fontSize: 13, color: '#991b1b' }}>{approveErr}</span>
            </div>
          )}

          {(draft.status === 'APPROVED' || createdRecordId) && (
            <div style={{ padding: '16px 20px', background: '#d1fae5', borderRadius: 12, border: '1.5px solid #6ee7b7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: createdRecordId ? 12 : 0 }}>
                <CheckCircle2 size={18} color="#059669" />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Historia clínica aprobada y firmada</span>
              </div>
              {createdRecordId && (
                <button
                  onClick={() => navigate(`/clinical-records/${createdRecordId}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  <FileText size={14} /> Ver registro clínico
                </button>
              )}
            </div>
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 12, color: 'var(--s400)' }}>
      <span style={{ fontWeight: 600 }}>{label}:</span> {value}
    </span>
  );
}

// Shows the AI's ICD-10 suggestion and lets the professional confirm, change
// or remove it before it becomes the record's diagnosis. The suggestion is
// never assigned automatically — clinical responsibility stays with the human.
function Icd10Suggestion({ value, editable, onChange }: {
  value: ICD10Code | null;
  editable: boolean;
  onChange: (v: ICD10Code | null) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['icd10', debounced],
    queryFn: () => diagnosesApi.searchIcd10(debounced),
    enabled: debounced.length >= 2,
  });
  const results: ICD10Code[] = data?.items ?? [];

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, border: '1px solid #ede9fe', background: '#faf5ff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Stethoscope size={16} color="#7c3aed" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>Diagnóstico CIE-10 sugerido</span>
        <span style={{ fontSize: 11, color: '#7c3aed', background: '#ede9fe', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>sugerencia IA</span>
      </div>

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1.5px solid #ddd6fe', borderRadius: 9, padding: '10px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#5b21b6' }}>{value.code}</span>
            {value.description && <span style={{ fontSize: 13, color: 'var(--s600)' }}> — {value.description}</span>}
          </div>
          {editable && (
            <button onClick={() => { onChange(null); setSearching(false); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 2 }} title="Quitar diagnóstico">
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--s500)' }}>
          Sin diagnóstico asignado. {editable && 'Puedes buscar uno para asignarlo al aprobar.'}
        </p>
      )}

      {editable && !searching && (
        <button
          onClick={() => setSearching(true)}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: '1px solid #ddd6fe', background: '#fff', color: '#7c3aed', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          <Search size={13} /> {value ? 'Cambiar diagnóstico' : 'Buscar diagnóstico'}
        </button>
      )}

      {editable && searching && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #ddd6fe', borderRadius: 9, padding: '8px 12px' }}>
            {isFetching ? <Spinner size={13} color="#7c3aed" /> : <Search size={13} color="var(--s400)" />}
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Código o descripción (mín. 2 caracteres)…"
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--s700)', outline: 'none' }}
            />
            <button onClick={() => { setSearching(false); setQuery(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 0 }}><X size={13} /></button>
          </div>
          {debounced.length >= 2 && results.length > 0 && (
            <div style={{ marginTop: 6, background: '#fff', border: '1px solid var(--s200)', borderRadius: 9, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
              {results.map(c => (
                <button
                  key={c.code}
                  onClick={() => { onChange(c); setSearching(false); setQuery(''); }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 13px', border: 'none', borderBottom: '1px solid var(--s50)', background: 'none', cursor: 'pointer', fontSize: 12.5 }}
                >
                  <span style={{ fontWeight: 700, color: '#5b21b6' }}>{c.code}</span>
                  <span style={{ color: 'var(--s600)' }}> — {c.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
