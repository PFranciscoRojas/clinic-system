import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { BreakGlassModal } from './BreakGlassModal';
interface Props {
  isPure: boolean;
  reason: string | null;
  onReason: (r: string) => void;
  children: ReactNode;
}

export function ClinicalGate({ isPure, reason, onReason, children }: Props) {
  const [showModal, setShowModal] = useState(false);

  if (!isPure || reason !== null) {
    return <>{children}</>;
  }

  const handleConfirm = (r: string) => {
    onReason(r);
    setShowModal(false);
  };

  return (
    <>
      {showModal && (
        <BreakGlassModal
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
      <div style={{
        background: '#f8fafc',
        border: '1.5px dashed #cbd5e1',
        borderRadius: 12,
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Lock size={20} color="#94a3b8" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#374151' }}>
            Información clínica restringida
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#9ca3af', lineHeight: 1.5 }}>
            El acceso a esta sección queda registrado (Ley 23/1981 · Res. 1995/1999).
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '8px 18px',
            background: '#fff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
            cursor: 'pointer',
          }}
        >
          Justificar acceso
        </button>
      </div>
    </>
  );
}
