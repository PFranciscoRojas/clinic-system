import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertTriangle, RefreshCw, Clock, ListChecks, ShieldAlert } from 'lucide-react';
import { aiSuggestionsApi, type RecapContent } from '@/api/aiSuggestions';
import { Spinner } from '@/components/ui/Spinner';

// Pre-session recap: a read-only AI summary of the patient's encrypted history
// so the professional walks in oriented. The model only summarizes — the human
// decides. Generated on demand, then polled until READY.
export function RecapCard({ patientId }: { patientId: string }) {
  const [requesting, setRequesting] = useState(false);
  const [reqErr, setReqErr] = useState('');

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['ai-recap', patientId],
    queryFn: () => aiSuggestionsApi.latest<RecapContent>(patientId, 'recap'),
    enabled: !!patientId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return (s === 'PENDING' || s === 'PROCESSING') ? 3000 : false;
    },
  });

  const handleGenerate = async () => {
    setRequesting(true); setReqErr('');
    try {
      await aiSuggestionsApi.request(patientId, 'recap');
      await refetch();
    } catch {
      setReqErr('No se pudo generar el recap. Intenta de nuevo.');
    } finally {
      setRequesting(false);
    }
  };

  const status = data?.status ?? 'NONE';
  const busy = requesting || status === 'PENDING' || status === 'PROCESSING';

  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={17} color="#7c3aed" />
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)', display: 'block' }}>Recap pre-sesión</span>
            <span style={{ fontSize: 11, color: 'var(--s400)' }}>Resumen IA de la historia · el profesional decide</span>
          </div>
        </div>
        {(status === 'READY' || status === 'FAILED') && !busy && (
          <button
            onClick={handleGenerate}
            title="Regenerar"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer' }}
          >
            <RefreshCw size={12} /> Regenerar
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner size={20} color="#7c3aed" /></div>
      ) : busy ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#f5f3ff', borderRadius: 10, border: '1px solid #ede9fe' }}>
          <Spinner size={18} color="#7c3aed" />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>Generando recap…</p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--s500)' }}>Leyendo la historia y resumiendo. Actualizando cada 3s…</p>
          </div>
        </div>
      ) : status === 'FAILED' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 8 }}>
          <AlertTriangle size={14} color="#dc2626" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>{data?.error || 'Falló la generación del recap.'}</span>
        </div>
      ) : status === 'READY' && data?.content ? (
        <RecapBody content={data.content} createdAt={data.created_at} />
      ) : (
        <div style={{ textAlign: 'center', padding: '18px 0' }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--s500)' }}>
            Genera un resumen de la historia del paciente antes de iniciar la sesión.
          </p>
          <button
            onClick={handleGenerate}
            style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <Sparkles size={14} /> Generar recap
          </button>
        </div>
      )}

      {reqErr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 8 }}>
          <AlertTriangle size={14} color="#dc2626" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>{reqErr}</span>
        </div>
      )}
    </div>
  );
}

function RecapBody({ content, createdAt }: { content: RecapContent; createdAt?: string }) {
  const empty = !content.summary && !content.last_session && !content.pending_tasks &&
    content.focus_points.length === 0 && !content.risk_flags;

  if (empty) {
    return <p style={{ margin: 0, fontSize: 13, color: 'var(--s400)' }}>Sin historia suficiente para resumir todavía.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {content.summary && <Block label="Resumen del proceso" text={content.summary} />}
      {content.last_session && <Block icon={<Clock size={13} color="#7c3aed" />} label="Última sesión" text={content.last_session} />}
      {content.pending_tasks && <Block icon={<ListChecks size={13} color="#7c3aed" />} label="Tareas pendientes" text={content.pending_tasks} />}
      {content.focus_points.length > 0 && (
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--s700)' }}>Puntos a retomar</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {content.focus_points.map((p, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--s700)', lineHeight: 1.5 }}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {content.risk_flags && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 9, padding: '10px 13px' }}>
          <ShieldAlert size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#92400e' }}>Señales de riesgo a vigilar</p>
            <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>{content.risk_flags}</p>
          </div>
        </div>
      )}
      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--s400)' }}>
        Generado por IA sobre la historia anonimizada{createdAt ? ` · ${new Date(createdAt).toLocaleString('es-CO')}` : ''}. Revisa antes de usar.
      </p>
    </div>
  );
}

function Block({ icon, label, text }: { icon?: React.ReactNode; label: string; text: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--s700)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon} {label}
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--s700)', lineHeight: 1.55 }}>{text}</p>
    </div>
  );
}
