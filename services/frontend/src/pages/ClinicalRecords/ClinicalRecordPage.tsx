import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, FileText, CheckCircle2, AlertTriangle,
  Edit3, Save, Shield, Download, Plus, X, PenLine,
} from 'lucide-react';
import { clinicalRecordsApi, type ClinicalRecord, type MentalExamEntry, type Addendum } from '@/api/clinicalRecords';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { RecordSectionsForm, recordToDraft, draftToPayload, validateDraft, type ClinicalDraft } from '@/components/clinical/RecordSectionsForm';
import { TEMPLATE_SECTIONS, MENTAL_EXAM_DOMAINS, RECORD_TYPE_LABELS, DISCHARGE_REASONS, riskMeta } from '@/components/clinical/constants';

export function ClinicalRecordPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClinicalDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [cosigning, setCosigning] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [err, setErr] = useState('');

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ['clinical-record', id],
    queryFn: () => clinicalRecordsApi.get(id!),
    enabled: !!id,
  });

  const startEditing = () => {
    if (record) {
      setDraft(recordToDraft(record.sections, record.risk_level, record.discharge_reason));
    }
    setEditing(true);
  };

  const handleSave = async () => {
    if (!id || !record || !draft) return;
    setErr('');
    const validation = validateDraft(record.record_type, draft);
    if (validation) { setErr(validation); return; }
    setSaving(true);
    try {
      await clinicalRecordsApi.update(id, draftToPayload(record.record_type, draft));
      queryClient.invalidateQueries({ queryKey: ['clinical-record', id] });
      setEditing(false); setDraft(null);
    } catch { setErr('Error al guardar. Intenta de nuevo.'); }
    finally { setSaving(false); }
  };

  const handleApprove = async () => {
    if (!id) return;
    setApproving(true); setErr('');
    try {
      await clinicalRecordsApi.approve(id);
      queryClient.invalidateQueries({ queryKey: ['clinical-record', id] });
    } catch { setErr('Error al aprobar. Verifica que los requisitos de co-firma se cumplan.'); }
    finally { setApproving(false); }
  };

  const handleCosign = async () => {
    if (!id) return;
    setCosigning(true); setErr('');
    try {
      await clinicalRecordsApi.cosign(id);
      queryClient.invalidateQueries({ queryKey: ['clinical-record', id] });
    } catch { setErr('Error al co-firmar.'); }
    finally { setCosigning(false); }
  };

  const handleExportPDF = async () => {
    if (!id || !record) return;
    setExportingPDF(true);
    try {
      const blob = await clinicalRecordsApi.exportPDF(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nota-${record.session_date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr('Error al descargar PDF.');
    } finally {
      setExportingPDF(false);
    }
  };

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={28} color="var(--teal)" /></div>;
  if (isError || !record) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 24 }}>
      <AlertTriangle size={16} /> Registro no encontrado
    </div>
  );

  const isDraft = record.status === 'DRAFT';
  const isIntern = user?.roles?.includes('INTERN') ?? false;
  const isSupervisor = record.supervisor_id === user?.user_id;
  const needsCosign = record.requires_cosign && !record.supervisor_cosigned_at;
  const risk = riskMeta(record.risk_level);
  const dischargeLabel = DISCHARGE_REASONS.find(r => r.value === record.discharge_reason)?.label;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: 0 }}>
        <ArrowLeft size={16} /> Volver
      </button>

      {/* Header */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={24} color="var(--teal)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>
                Registro clínico · {RECORD_TYPE_LABELS[record.record_type] ?? record.record_type}
              </h1>
              <Badge
                label={isDraft ? 'Borrador' : 'Aprobado'}
                color={isDraft ? '#92400e' : '#065f46'}
                bg={isDraft ? '#fef3c7' : '#d1fae5'}
              />
              {risk && !editing && (
                <Badge label={`Riesgo: ${risk.label}`} color={risk.color} bg={risk.bg} />
              )}
              {dischargeLabel && <Badge label={dischargeLabel} color="#374151" bg="#f1f5f9" />}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <InfoLine label="Fecha de sesión" value={record.session_date} />
              <InfoLine label="Creado" value={new Date(record.created_at).toLocaleDateString('es-CO')} />
              {record.approved_at && <InfoLine label="Aprobado" value={new Date(record.approved_at).toLocaleDateString('es-CO')} />}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isDraft && !editing && (
              <button onClick={startEditing} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <Edit3 size={14} /> Editar
              </button>
            )}
            {!isDraft && (
              <button onClick={handleExportPDF} disabled={exportingPDF} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: '#f0fdfa', color: 'var(--teal)', border: '1px solid var(--teal)', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: exportingPDF ? 0.6 : 1 }}>
                <Download size={14} /> {exportingPDF ? 'Generando…' : 'Descargar PDF'}
              </button>
            )}
          </div>
        </div>

        {/* Co-sign badge */}
        {record.requires_cosign && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: needsCosign ? '#fef3c7' : '#d1fae5', borderRadius: 10, border: `1px solid ${needsCosign ? '#fde68a' : '#6ee7b7'}` }}>
            <Shield size={14} color={needsCosign ? '#92400e' : '#059669'} />
            <span style={{ fontSize: 13, color: needsCosign ? '#92400e' : '#065f46', fontWeight: 500 }}>
              {needsCosign ? 'Pendiente de co-firma del supervisor' : 'Co-firmado por supervisor'}
            </span>
          </div>
        )}
      </div>

      {/* Content — clinical-record sections */}
      {editing && draft ? (
        <div style={{ marginBottom: 24 }}>
          <RecordSectionsForm recordType={record.record_type} value={draft} onChange={setDraft} />
        </div>
      ) : (
        <V2RecordView record={record} />
      )}

      {err && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fee2e2', borderRadius: 10, border: '1.5px solid #fca5a5', marginBottom: 12 }}>
          <AlertTriangle size={15} color="#dc2626" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>{err}</span>
        </div>
      )}

      {/* Action bar */}
      {isDraft && (
        <div style={{ display: 'flex', gap: 12 }}>
          {editing ? (
            <>
              <button onClick={() => { setDraft(null); setEditing(false); }} style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                Descartar
              </button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: 13, borderRadius: 11, background: '#6366f1', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}>
                {saving ? <Spinner size={16} color="#fff" /> : <Save size={16} />}
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
              {isSupervisor && needsCosign && (
                <button onClick={handleCosign} disabled={cosigning} style={{ flex: 1, padding: 13, borderRadius: 11, background: '#f59e0b', color: '#fff', border: 'none', cursor: cosigning ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: cosigning ? 0.7 : 1 }}>
                  {cosigning ? <Spinner size={16} color="#fff" /> : <Shield size={16} />}
                  {cosigning ? 'Firmando…' : 'Co-firmar registro'}
                </button>
              )}
              {!isIntern && (
                <button onClick={handleApprove} disabled={approving || (record.requires_cosign && needsCosign)} style={{ flex: 2, padding: 13, borderRadius: 11, background: 'var(--teal)', color: '#fff', border: 'none', cursor: (approving || (record.requires_cosign && needsCosign)) ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (approving || (record.requires_cosign && needsCosign)) ? 0.6 : 1 }}>
                  {approving ? <Spinner size={16} color="#fff" /> : <CheckCircle2 size={16} />}
                  {approving ? 'Aprobando…' : record.requires_cosign && needsCosign ? 'Falta co-firma' : 'Aprobar registro'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!isDraft && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: '#d1fae5', borderRadius: 12, border: '1.5px solid #6ee7b7' }}>
          <CheckCircle2 size={18} color="#059669" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Registro clínico aprobado y firmado</span>
          {record.approved_at && <span style={{ fontSize: 12, color: '#059669', marginLeft: 'auto' }}>{new Date(record.approved_at).toLocaleDateString('es-CO')}</span>}
        </div>
      )}

      {!isDraft && <AddendaSection recordId={id!} />}
    </div>
  );
}

// Read-only view of a template-v2 record, in the section order of its type.
function V2RecordView({ record }: { record: ClinicalRecord }) {
  const defs = TEMPLATE_SECTIONS[record.record_type as keyof typeof TEMPLATE_SECTIONS] ?? [];
  const sections = record.sections ?? {};
  const mentalExam = (sections.mental_exam ?? null) as Record<string, MentalExamEntry> | null;
  const riskNote = typeof sections.risk_note === 'string' ? sections.risk_note : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
      {defs.map(def => {
        const content = sections[def.key];
        if (typeof content !== 'string' || !content) return null;
        return (
          <div key={def.key} className="card" style={{ padding: '16px 20px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>{def.label}</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{content}</p>
          </div>
        );
      })}

      {mentalExam && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>Examen mental</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {MENTAL_EXAM_DOMAINS.map(d => {
              const entry = mentalExam[d.key];
              if (!entry) return null;
              const altered = entry.status === 'ALTERED';
              return (
                <div key={d.key} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 10px', borderRadius: 8, background: altered ? '#fffbeb' : 'transparent' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', width: 180, flexShrink: 0 }}>{d.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: altered ? '#92400e' : '#065f46' }}>
                    {altered ? 'Alterado' : 'Normal'}
                  </span>
                  {altered && entry.note && <span style={{ fontSize: 13, color: 'var(--s600)' }}>— {entry.note}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {riskNote && (
        <div className="card" style={{ padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#92400e' }}>Nota sobre el riesgo</p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{riskNote}</p>
        </div>
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

// Addenda: signed, immutable supplementary notes on an approved record
// (the original entry is never edited — Res. 1995/1999).
function AddendaSection({ recordId }: { recordId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const { data } = useQuery({
    queryKey: ['addenda', recordId],
    queryFn: () => clinicalRecordsApi.listAddenda(recordId),
  });
  const addenda: Addendum[] = data?.items ?? [];

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true); setErr('');
    try {
      await clinicalRecordsApi.addAddendum(recordId, content.trim());
      setContent(''); setAdding(false);
      queryClient.invalidateQueries({ queryKey: ['addenda', recordId] });
    } catch { setErr('Error al guardar la adenda.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 20, background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: addenda.length || adding ? '1px solid var(--s100)' : 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>
          <PenLine size={15} color="var(--teal)" /> Adendas
          {addenda.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--s100)', color: 'var(--s600)' }}>{addenda.length}</span>}
        </span>
        <button
          onClick={() => { setAdding(a => !a); setErr(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: adding ? 'var(--s100)' : 'var(--teal)', color: adding ? 'var(--s700)' : '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          {adding ? <X size={12} /> : <Plus size={12} />}
          {adding ? 'Cancelar' : 'Agregar adenda'}
        </button>
      </div>

      {adding && (
        <div style={{ padding: '14px 20px', borderBottom: addenda.length ? '1px solid var(--s100)' : 'none', background: 'var(--s50)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--s500)' }}>
            La adenda complementa o corrige el registro aprobado sin modificar el original. Queda firmada con tu nombre, fecha y hora, es permanente y se imprime en el PDF.
          </p>
          <textarea
            autoFocus value={content} onChange={e => setContent(e.target.value)} rows={4}
            placeholder="Texto de la adenda…"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)', resize: 'vertical', boxSizing: 'border-box', background: '#fff', lineHeight: 1.6 }}
          />
          <button onClick={handleSave} disabled={saving || !content.trim()}
            style={{ marginTop: 8, padding: '9px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving || !content.trim() ? 0.6 : 1 }}>
            {saving ? 'Guardando…' : 'Firmar y agregar adenda'}
          </button>
          {err && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--red)' }}>{err}</p>}
        </div>
      )}

      {addenda.map((a, idx) => (
        <div key={a.id} style={{ padding: '12px 20px', borderBottom: idx < addenda.length - 1 ? '1px solid var(--s100)' : 'none' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11.5, color: 'var(--s400)', fontWeight: 600 }}>
            {new Date(a.created_at).toLocaleString('es-CO')} — {a.author_name}
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--s700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.content}</p>
        </div>
      ))}
    </div>
  );
}
