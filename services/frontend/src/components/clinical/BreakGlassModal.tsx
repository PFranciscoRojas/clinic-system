import { useState } from 'react';

interface Props {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function BreakGlassModal({ onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', maxWidth: 440, width: '90vw', boxSizing: 'border-box', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>Acceso excepcional</div>
        <p style={{ fontSize: 13.5, color: 'var(--s600)', margin: '0 0 18px' }}>
          Como administrador sin perfil clínico, tu acceso a esta historia quedará registrado en la auditoría de acuerdo con la Ley 23/1981 y la Res. 1995/1999.
          <br /><br />
          Describe brevemente el motivo de esta consulta:
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej: Revisión de reclamación, supervisión administrativa, solicitud legal…"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${reason.trim().length >= 10 ? '#0891b2' : 'var(--s200)'}`, fontSize: 13.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
        />
        {reason.trim().length > 0 && reason.trim().length < 10 && (
          <p style={{ fontSize: 11.5, color: '#dc2626', margin: '4px 0 0' }}>Describe el motivo con más detalle (mín. 10 caracteres).</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13.5, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            disabled={reason.trim().length < 10}
            onClick={() => onConfirm(reason.trim())}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: reason.trim().length >= 10 ? '#b45309' : 'var(--s200)', color: reason.trim().length >= 10 ? '#fff' : 'var(--s400)', fontSize: 13.5, fontWeight: 600, cursor: reason.trim().length >= 10 ? 'pointer' : 'not-allowed' }}>
            Continuar con registro
          </button>
        </div>
      </div>
    </div>
  );
}
