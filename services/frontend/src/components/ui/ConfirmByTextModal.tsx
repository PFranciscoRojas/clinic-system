import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  confirmLabel?: string;
  confirmText: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmByTextModal({ title, description, confirmLabel = 'Desactivar', confirmText, onConfirm, onCancel, danger = true }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const matches = input.trim() === confirmText.trim();

  const handleConfirm = async () => {
    if (!matches) return;
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: danger ? '#fef2f2' : 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} color={danger ? 'var(--red)' : 'var(--teal)'} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--s800)' }}>{title}</div>
        </div>

        <p style={{ fontSize: 14, color: 'var(--s600)', lineHeight: 1.65, marginBottom: 18 }}>{description}</p>

        <div style={{ background: 'var(--s50)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--s600)', marginBottom: 8 }}>
            Para confirmar, escribe exactamente: <strong style={{ fontFamily: 'monospace' }}>{confirmText}</strong>
          </p>
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && matches && handleConfirm()}
            placeholder={confirmText}
            style={{
              width: '100%', padding: '9px 12px', border: `1.5px solid ${matches ? 'var(--teal)' : 'var(--s200)'}`,
              borderRadius: 9, fontSize: 14, color: 'var(--s800)', background: '#fff', boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matches || loading}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, border: 'none',
              background: (!matches || loading) ? 'var(--s200)' : (danger ? 'var(--red)' : 'var(--teal)'),
              color: (!matches || loading) ? 'var(--s400)' : '#fff',
              fontSize: 14, fontWeight: 700, cursor: (!matches || loading) ? 'not-allowed' : 'pointer',
              transition: 'all .15s',
            }}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
