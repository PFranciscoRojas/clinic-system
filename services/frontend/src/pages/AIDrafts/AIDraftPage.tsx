import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Brain, Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Edit3, Save, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { aiDraftsApi, type DraftStatus } from '@/api/aiDrafts';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

const STATUS_CONFIG: Record<DraftStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PENDING:      { label: 'En cola',        color: '#6b7280', bg: '#f3f4f6', Icon: Clock        },
  PROCESSING:   { label: 'Procesando',     color: '#0369a1', bg: '#e0f2fe', Icon: RefreshCw    },
  DRAFT_READY:  { label: 'Listo',          color: '#065f46', bg: '#d1fae5', Icon: CheckCircle2 },
  APPROVED:     { label: 'Aprobado',       color: '#fff',    bg: '#059669', Icon: CheckCircle2 },
  REJECTED:     { label: 'Rechazado',      color: '#92400e', bg: '#fef3c7', Icon: AlertTriangle },
  ERROR:        { label: 'Error',          color: '#991b1b', bg: '#fee2e2', Icon: AlertTriangle },
};

interface SOAPSection {
  key: 'subjective' | 'objective' | 'assessment' | 'plan';
  label: string;
  description: string;
}

const SOAP_SECTIONS: SOAPSection[] = [
  { key: 'subjective', label: 'S — Subjetivo',  description: 'Lo que reporta el paciente: síntomas, sentimientos, preocupaciones en sus propias palabras.' },
  { key: 'objective',  label: 'O — Objetivo',   description: 'Observaciones clínicas: comportamiento, afecto, apariencia, pruebas aplicadas.' },
  { key: 'assessment', label: 'A — Evaluación', description: 'Análisis clínico, diagnóstico diferencial, avance terapéutico.' },
  { key: 'plan',       label: 'P — Plan',        description: 'Intervenciones, tareas, próximos pasos, ajustes al tratamiento.' },
];

export function AIDraftPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['subjective']));
  const [soapEdit, setSoapEdit] = useState<Record<string, string>>({});

  const { data: draft, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-draft', id],
    queryFn: () => aiDraftsApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === 'PENDING' || status === 'PROCESSING') ? 3000 : false;
    },
  });

  const toggleSection = (key: string) => {
    setExpanded(prev => {
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

  const content = draft.draft_content_plain as Record<string, string> | null;

  const getSoap = (key: string) => soapEdit[key] ?? content?.[key] ?? '';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
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
            <div style={{ display: 'flex', gap: 20 }}>
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
              : 'Whisper está transcribiendo el audio y el modelo IA está generando el SOAP'}
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

      {/* SOAP Content */}
      {(isReady || draft.status === 'APPROVED') && content && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Sparkles size={16} color="#f59e0b" />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--s500)', fontStyle: 'italic' }}>
              Generado por IA · Revisa y edita antes de aprobar
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {SOAP_SECTIONS.map(({ key, label, description }) => {
              const isOpen = expanded.has(key);
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
                          value={getSoap(key)}
                          onChange={e => setSoapEdit(prev => ({ ...prev, [key]: e.target.value }))}
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
                          {getSoap(key) || <em style={{ color: 'var(--s300)' }}>Sin contenido</em>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          {isReady && (
            <div style={{ display: 'flex', gap: 12 }}>
              {editing ? (
                <>
                  <button
                    onClick={() => { setSoapEdit({}); setEditing(false); }}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}
                  >
                    Descartar cambios
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Save size={16} /> Guardar cambios
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
                    style={{ flex: 2, padding: 13, borderRadius: 11, background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <CheckCircle2 size={16} /> Aprobar historia clínica
                  </button>
                </>
              )}
            </div>
          )}

          {draft.status === 'APPROVED' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: '#d1fae5', borderRadius: 12, border: '1.5px solid #6ee7b7' }}>
              <CheckCircle2 size={18} color="#059669" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Historia clínica aprobada y firmada</span>
            </div>
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
