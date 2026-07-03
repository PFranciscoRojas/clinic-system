import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { consentTemplatesApi, type ConsentType } from '@/api/clinicalRecords';
import { SectionCard } from './primitives';

const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  TREATMENT: 'Tratamiento',
  RECORDING: 'Grabación de sesiones',
  DATA_PROCESSING: 'Tratamiento de datos',
  INFORMATION_SHARING: 'Compartir información',
};

export function ConsentTemplatesSection() {
  const queryClient = useQueryClient();
  const [editingType, setEditingType] = useState<ConsentType | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedType, setSavedType] = useState<ConsentType | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['consent-templates'],
    queryFn: consentTemplatesApi.list,
  });
  const templates = data?.items ?? [];

  const startEdit = (type: ConsentType) => {
    const t = templates.find(x => x.consent_type === type);
    setEditingType(type);
    setTitle(t?.title ?? '');
    setBody(t?.body ?? '');
    setError('');
  };

  const handleSave = async () => {
    if (!editingType || !title.trim() || !body.trim()) return;
    setSaving(true);
    setError('');
    try {
      await consentTemplatesApi.update(editingType, { title: title.trim(), body: body.trim() });
      await queryClient.invalidateQueries({ queryKey: ['consent-templates'] });
      setSavedType(editingType);
      setEditingType(null);
      setTimeout(() => setSavedType(null), 5000);
    } catch {
      setError('No se pudo guardar la plantilla. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Plantillas de consentimiento" icon={ShieldCheck} color="#2a2769">
      <p style={{ margin: '12px 0 4px', fontSize: 12.5, color: 'var(--s400)', lineHeight: 1.6 }}>
        Editar crea una versión nueva. Los consentimientos ya firmados conservan el texto exacto que el paciente aceptó.
      </p>
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><Spinner size={20} color="var(--teal)" /></div>
      ) : (
        (Object.keys(CONSENT_TYPE_LABELS) as ConsentType[]).map(type => {
          const t = templates.find(x => x.consent_type === type);
          const isEditing = editingType === type;
          return (
            <div key={type} style={{ padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>
                    {t?.title ?? CONSENT_TYPE_LABELS[type]}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--s400)' }}>
                    {CONSENT_TYPE_LABELS[type]}{t ? ` · versión ${t.version}` : ' · sin plantilla'}
                    {savedType === type && <span style={{ color: '#059669', fontWeight: 600, marginLeft: 8 }}>✓ Versión nueva guardada</span>}
                  </p>
                </div>
                <button
                  onClick={() => isEditing ? setEditingType(null) : startEdit(type)}
                  style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s700)', cursor: 'pointer' }}
                >
                  {isEditing ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              {isEditing && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Título</label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }}
                  />
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Texto del documento</label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={10}
                    style={{ width: '100%', minHeight: 220, padding: '12px 14px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--red)' }}>{error}</p>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      onClick={handleSave}
                      disabled={saving || !title.trim() || !body.trim()}
                      style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !title.trim() || !body.trim() ? 0.6 : 1 }}
                    >
                      {saving ? 'Guardando…' : 'Guardar versión nueva'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </SectionCard>
  );
}

// ── Users section ────────────────────────────────────────────────────────────

