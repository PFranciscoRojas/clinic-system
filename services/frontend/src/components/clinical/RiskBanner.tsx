import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { aiSuggestionsApi, type RiskAssessmentContent, type RiskLevel } from '@/api/aiSuggestions';
import { Spinner } from '@/components/ui/Spinner';

const LEVEL_CFG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; prominent: boolean }> = {
  none:     { label: 'Sin señales', color: '#3e6b4e', bg: '#e8f2ec', border: '#bfe0cd', prominent: false },
  low:      { label: 'Riesgo bajo', color: '#5a6b3e', bg: '#f1f4e8', border: '#d8e0bf', prominent: false },
  moderate: { label: 'Riesgo moderado', color: '#92400e', bg: '#fef3c7', border: '#fcd34d', prominent: true },
  high:     { label: 'Riesgo alto', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5', prominent: true },
};

// AI risk read over the patient's history. Decision support ONLY — it flags
// signals to review, never clears a patient and never replaces clinical
// judgment. Refreshed automatically when a record is approved; can also be run
// on demand. Compact for none/low, prominent for moderate/high.
//
// `concealed`: the result stays behind a neutral toggle until the professional
// reveals it — for screens a patient may be looking at during the session,
// where even the banner's color would leak the assessment.
export function RiskBanner({ patientId, concealed = false }: { patientId: string; concealed?: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const [reqErr, setReqErr] = useState('');
  const [revealed, setRevealed] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['ai-risk', patientId],
    queryFn: () => aiSuggestionsApi.latest<RiskAssessmentContent>(patientId, 'risk_detection'),
    enabled: !!patientId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return (s === 'PENDING' || s === 'PROCESSING') ? 3000 : false;
    },
  });

  const handleAnalyze = async () => {
    setRequesting(true); setReqErr('');
    try {
      await aiSuggestionsApi.request(patientId, 'risk_detection');
      await refetch();
    } catch {
      setReqErr('No se pudo analizar el riesgo. Intenta de nuevo.');
    } finally {
      setRequesting(false);
    }
  };

  const status = data?.status ?? 'NONE';
  const busy = requesting || status === 'PENDING' || status === 'PROCESSING';

  if (isLoading) return null;

  if (busy) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f3f2fb', border: '1px solid #e4e2f6', borderRadius: 10 }}>
        <Spinner size={15} color="#5b52ad" />
        <span style={{ fontSize: 12.5, color: 'var(--s600)' }}>Analizando señales de riesgo en la historia…</span>
      </div>
    );
  }

  if (reqErr) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 10 }}>
        <AlertTriangle size={14} color="#dc2626" />
        <span style={{ fontSize: 13, color: '#991b1b' }}>{reqErr}</span>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <button
        onClick={handleAnalyze}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: '#9a3412' }}
      >
        <RefreshCw size={13} /> No se pudo analizar el riesgo — reintentar
      </button>
    );
  }

  if (status !== 'READY' || !data?.content) {
    // No analysis yet (e.g. patient with no approved records, or never run).
    return (
      <button
        onClick={handleAnalyze}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: '#faf6f1', border: '1px solid var(--s200)', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--s600)' }}
      >
        <ShieldAlert size={14} color="#5b52ad" /> Analizar riesgo con IA
      </button>
    );
  }

  if (concealed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => setRevealed(r => !r)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: '#faf6f1', border: '1px solid var(--s200)', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--s600)' }}
        >
          <ShieldAlert size={14} color="var(--s400)" />
          {revealed ? 'Ocultar evaluación de riesgo' : 'Evaluación de riesgo IA — mostrar'}
        </button>
        {revealed && <RiskBody content={data.content} createdAt={data.created_at} onReanalyze={handleAnalyze} />}
      </div>
    );
  }

  return <RiskBody content={data.content} createdAt={data.created_at} onReanalyze={handleAnalyze} />;
}

function RiskBody({ content, createdAt, onReanalyze }: { content: RiskAssessmentContent; createdAt?: string; onReanalyze: () => void }) {
  const cfg = LEVEL_CFG[content.level] ?? LEVEL_CFG.moderate;
  const Icon = content.level === 'none' ? ShieldCheck : ShieldAlert;
  const [open, setOpen] = useState(cfg.prominent);

  return (
    <div style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 11, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={18} color={cfg.color} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>IA · {cfg.label}</span>
          {content.signals.length > 0 && (
            <span style={{ fontSize: 12, color: cfg.color, opacity: 0.85, marginLeft: 8 }}>
              {content.signals.length} {content.signals.length === 1 ? 'señal' : 'señales'}
            </span>
          )}
        </div>
        {(content.signals.length > 0 || content.rationale || content.recommendation) && (
          <button
            onClick={() => setOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.color, fontSize: 12, fontWeight: 600, textDecoration: 'underline', padding: 0 }}
          >
            {open ? 'Ocultar' : 'Ver detalle'}
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cfg.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {content.signals.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {content.signals.map((s, i) => (
                <li key={i} style={{ fontSize: 12.5, color: cfg.color, lineHeight: 1.5 }}>{s}</li>
              ))}
            </ul>
          )}
          {content.rationale && (
            <p style={{ margin: 0, fontSize: 12.5, color: cfg.color, lineHeight: 1.5 }}>{content.rationale}</p>
          )}
          {content.recommendation && (
            <p style={{ margin: 0, fontSize: 12.5, color: cfg.color, fontWeight: 600, lineHeight: 1.5 }}>
              Sugerencia: {content.recommendation}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: cfg.color, opacity: 0.75 }}>
              Apoyo a la decisión generado por IA{createdAt ? ` · ${new Date(createdAt).toLocaleString('es-CO')}` : ''}. No reemplaza el juicio clínico; "sin señales" no descarta riesgo.
            </span>
            <button
              onClick={onReanalyze}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: cfg.color, fontSize: 11.5, fontWeight: 600 }}
            >
              <RefreshCw size={11} /> Reanalizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
