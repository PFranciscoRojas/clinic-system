import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, FileCheck } from 'lucide-react';
import { consentsApi, consentTemplatesApi, type ConsentType } from '@/api/clinicalRecords';
import { Spinner } from '@/components/ui/Spinner';
import { SignatureCanvas } from './SignatureCanvas';

interface Props {
  patientId: string;
  consentType: ConsentType;
  onClose: () => void;
  onSigned: () => void;
}

// In-office signing: the patient reads the active template on the
// professional's device, ticks the acceptance box and draws their signature.
export function ConsentSignModal({ patientId, consentType, onClose, onSigned }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['consent-templates'],
    queryFn: consentTemplatesApi.list,
  });
  const template = data?.items.find(t => t.consent_type === consentType);

  const canSave = accepted && !!signature && !saving;

  const handleSave = async () => {
    if (!signature) return;
    setSaving(true);
    setError('');
    try {
      await consentsApi.sign(patientId, { consent_type: consentType, accepted: true, signature_png: signature });
      onSigned();
      onClose();
    } catch {
      setError('No se pudo guardar la firma. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div className="card anim-fade-in" style={{ width: 640, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck size={18} color="var(--teal)" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--s800)' }}>Firmar consentimiento</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)' }}><X size={18} /></button>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} color="var(--teal)" /></div>
        ) : !template ? (
          <p style={{ fontSize: 13, color: 'var(--red)' }}>No hay plantilla activa para este tipo de consentimiento. Créala en Configuración.</p>
        ) : (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--s800)' }}>{template.title}</h3>
            <div style={{ maxHeight: 300, overflowY: 'auto', padding: '16px 18px', background: 'var(--s50)', borderRadius: 10, border: '1px solid var(--s200)', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--s700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{template.body}</p>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--teal)' }} />
              <span style={{ fontSize: 13.5, color: 'var(--s700)', lineHeight: 1.5 }}>
                Leí y acepto el contenido de este documento
              </span>
            </label>

            <SignatureCanvas onChange={setSignature} />

            {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--red)' }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s600)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: canSave ? 'var(--teal)' : 'var(--s200)', color: '#fff', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}
              >
                {saving ? 'Guardando…' : 'Guardar firma'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
