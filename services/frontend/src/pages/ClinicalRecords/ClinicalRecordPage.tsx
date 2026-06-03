import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, FileText, CheckCircle2, Clock, AlertTriangle,
  Edit3, Save, ChevronDown, ChevronUp, Shield,
} from 'lucide-react';
import { clinicalRecordsApi, type ClinicalRecord } from '@/api/clinicalRecords';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

const RECORD_TYPE_LABEL: Record<string, string> = {
  INITIAL: 'Inicial', EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta', INTERCONSULTATION: 'Interconsulta',
};

const SOAP_SECTIONS = [
  { key: 'subjective' as const, label: 'S — Subjetivo',  description: 'Lo que reporta el paciente en sus propias palabras.' },
  { key: 'objective'  as const, label: 'O — Objetivo',   description: 'Observaciones clínicas, comportamiento y apariencia.' },
  { key: 'assessment' as const, label: 'A — Evaluación', description: 'Análisis clínico y avance terapéutico.' },
  { key: 'plan'       as const, label: 'P — Plan',        description: 'Intervenciones, tareas y próximos pasos.' },
];

export function ClinicalRecordPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['subjective']));
  const [soapEdit, setSoapEdit] = useState<Partial<ClinicalRecord>>({});
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [cosigning, setCosigning] = useState(false);
  const [err, setErr] = useState('');

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ['clinical-record', id],
    queryFn: () => clinicalRecordsApi.get(id!),
    enabled: !!id,
  });

  const toggle = (key: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const handleSave = async () => {
    if (!id) return;
    setSaving(true); setErr('');
    try {
      await clinicalRecordsApi.update(id, soapEdit);
      queryClient.invalidateQueries({ queryKey: ['clinical-record', id] });
      setEditing(false); setSoapEdit({});
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
  const getSoap = (key: keyof typeof soapEdit) => soapEdit[key] as string ?? record[key] ?? '';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
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
                Registro clínico · {RECORD_TYPE_LABEL[record.record_type] ?? record.record_type}
              </h1>
              <Badge
                label={isDraft ? 'Borrador' : 'Aprobado'}
                color={isDraft ? '#92400e' : '#065f46'}
                bg={isDraft ? '#fef3c7' : '#d1fae5'}
              />
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <InfoLine label="Fecha de sesión" value={record.session_date} />
              <InfoLine label="Creado" value={new Date(record.created_at).toLocaleDateString('es-CO')} />
              {record.approved_at && <InfoLine label="Aprobado" value={new Date(record.approved_at).toLocaleDateString('es-CO')} />}
            </div>
          </div>
          {isDraft && !editing && (
            <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Edit3 size={14} /> Editar
            </button>
          )}
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

      {/* SOAP sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {SOAP_SECTIONS.map(({ key, label, description }) => {
          const isOpen = expanded.has(key);
          return (
            <div key={key} className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <button onClick={() => toggle(key)} style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>{label}</p>
                  {!isOpen && <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{description}</p>}
                </div>
                {isOpen ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
              </button>
              {isOpen && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--s100)' }}>
                  <p style={{ fontSize: 12, color: 'var(--s400)', margin: '12px 0 10px', fontStyle: 'italic' }}>{description}</p>
                  {editing && isDraft ? (
                    <textarea
                      value={getSoap(key)}
                      onChange={e => setSoapEdit(p => ({ ...p, [key]: e.target.value }))}
                      rows={6}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--teal)', fontSize: 14, color: 'var(--s700)', resize: 'vertical', background: '#fff', boxSizing: 'border-box', lineHeight: 1.7 }}
                    />
                  ) : (
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                      {getSoap(key) || <em style={{ color: 'var(--s300)' }}>Sin contenido</em>}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
              <button onClick={() => { setSoapEdit({}); setEditing(false); }} style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
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

function Clock2({ size, color }: { size: number; color: string }) {
  return <Clock size={size} color={color} />;
}
void Clock2;
