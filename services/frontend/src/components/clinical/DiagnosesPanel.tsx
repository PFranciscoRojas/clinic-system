import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, Plus, Search, X } from 'lucide-react';
import { diagnosesApi, type Diagnosis, type DiagnosisStatus, type ICD10Code } from '@/api/diagnoses';
import { Spinner } from '@/components/ui/Spinner';

const STATUS_CFG: Record<DiagnosisStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: 'Activo',     color: '#1e40af', bg: '#dbeafe' },
  RESOLVED:  { label: 'Resuelto',   color: '#065f46', bg: '#d1fae5' },
  RULED_OUT: { label: 'Descartado', color: '#374151', bg: '#f1f5f9' },
};

const NEXT_STATUS: Record<DiagnosisStatus, DiagnosisStatus[]> = {
  ACTIVE: ['RESOLVED', 'RULED_OUT'],
  RESOLVED: ['ACTIVE'],
  RULED_OUT: ['ACTIVE'],
};

export function DiagnosesPanel({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: dxData, isLoading } = useQuery({
    queryKey: ['diagnoses', patientId],
    queryFn: () => diagnosesApi.list(patientId),
  });
  const diagnoses: Diagnosis[] = dxData?.items ?? [];

  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ['icd10', debounced],
    queryFn: () => diagnosesApi.searchIcd10(debounced),
    enabled: debounced.length >= 2,
  });
  const results: ICD10Code[] = searchData?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['diagnoses', patientId] });

  const handleAdd = async (code: ICD10Code) => {
    setSaving(true); setErr('');
    try {
      await diagnosesApi.create(patientId, { icd10_code: code.code });
      setAdding(false); setQuery('');
      refresh();
    } catch { setErr('Error al asignar el diagnóstico.'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (dx: Diagnosis, status: DiagnosisStatus) => {
    setErr('');
    try {
      await diagnosesApi.updateStatus(dx.id, status);
      refresh();
    } catch { setErr('Error al actualizar el estado.'); }
  };

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--s100)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>
          <Stethoscope size={15} color="var(--teal)" /> Diagnósticos CIE-10
        </span>
        <button
          onClick={() => { setAdding(a => !a); setErr(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: adding ? 'var(--s100)' : 'var(--teal)', color: adding ? 'var(--s700)' : '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          {adding ? <X size={12} /> : <Plus size={12} />}
          {adding ? 'Cancelar' : 'Asignar diagnóstico'}
        </button>
      </div>

      {adding && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--s100)', background: 'var(--s50)' }}>
          <div style={{ position: 'relative', marginBottom: results.length ? 10 : 0 }}>
            <Search size={14} color="var(--s400)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Busca por código (F32) o descripción (depresivo)…"
              style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)', boxSizing: 'border-box', background: '#fff' }}
            />
            {searching && <Spinner size={14} color="var(--s400)" />}
          </div>
          {results.map(code => (
            <button
              key={code.code}
              disabled={saving}
              onClick={() => handleAdd(code)}
              style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'baseline', padding: '9px 12px', background: '#fff', border: '1px solid var(--s100)', borderRadius: 8, cursor: 'pointer', textAlign: 'left', marginBottom: 4 }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', fontFamily: 'monospace' }}>{code.code}</span>
              <span style={{ fontSize: 13, color: 'var(--s700)' }}>{code.description}</span>
            </button>
          ))}
          {debounced.length >= 2 && !searching && results.length === 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--s400)' }}>Sin resultados en el catálogo.</p>
          )}
        </div>
      )}

      {err && (
        <div style={{ padding: '10px 20px', background: '#fee2e2', fontSize: 13, color: '#991b1b' }}>{err}</div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner size={20} color="var(--teal)" /></div>
      ) : diagnoses.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <Stethoscope size={32} color="var(--s200)" style={{ marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--s400)' }}>Sin diagnósticos asignados</p>
        </div>
      ) : (
        diagnoses.map((dx, idx) => {
          const cfg = STATUS_CFG[dx.status];
          return (
            <div key={dx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: idx < diagnoses.length - 1 ? '1px solid var(--s100)' : 'none', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', fontFamily: 'monospace', width: 56 }}>{dx.icd10_code}</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--s700)', fontWeight: 500 }}>{dx.description}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--s400)' }}>
                  Diagnosticado {new Date(dx.diagnosed_at).toLocaleDateString('es-CO')}
                  {dx.resolved_at ? ` · cerrado ${new Date(dx.resolved_at).toLocaleDateString('es-CO')}` : ''}
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {NEXT_STATUS[dx.status].map(next => (
                  <button
                    key={next}
                    onClick={() => handleStatus(dx, next)}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s600)', cursor: 'pointer' }}
                  >
                    {STATUS_CFG[next].label}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
