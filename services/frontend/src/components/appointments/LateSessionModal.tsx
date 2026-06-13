import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, X, AlertCircle } from 'lucide-react';

import { appointmentsApi } from '@/api/appointments';
import { Spinner } from '@/components/ui/Spinner';
import { BirthDateField } from '@/components/patients/BirthDateField';
import { useAuth } from '@/context/AuthContext';

// Registers a session that happened but was never recorded (extemporaneous
// entry, Res. 1995/1999): creates the appointment at its real past date,
// marks it COMPLETED and opens it so the note is written with a mandatory
// justification that is disclosed in the record and the exported PDF.

function tzOffset(): string {
  const off = new Date().getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

interface Props {
  patientId: string;
  onClose: () => void;
}

export function LateSessionModal({ patientId, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [date,     setDate]     = useState('');
  // Hour/minute are optional — the date is what matters legally. Default noon.
  const [hour,     setHour]     = useState('12');
  const [minute,   setMinute]   = useState('00');
  const [duration, setDuration] = useState(50);
  const [modality, setModality] = useState<'IN_PERSON' | 'VIRTUAL'>('IN_PERSON');
  const [reason,   setReason]   = useState('');
  const [err,      setErr]      = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!date) { setErr('Indica la fecha real de la sesión.'); return; }
    const scheduledAt = `${date}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00${tzOffset()}`;
    if (new Date(scheduledAt).getTime() >= Date.now()) {
      setErr('La sesión debe ser en el pasado — para citas futuras usa "Nueva cita".');
      return;
    }
    if (reason.trim().length < 10) {
      setErr('La justificación es obligatoria (mínimo 10 caracteres) — quedará en la historia clínica.');
      return;
    }
    setSaving(true);
    try {
      const { id } = await appointmentsApi.create({
        patient_id:   patientId,
        staff_id:     user!.user_id,
        scheduled_at: scheduledAt,
        duration_min: duration,
        modality,
      });
      await appointmentsApi.updateStatus(id, 'COMPLETED');
      sessionStorage.setItem(`sghcp_late_reason_${id}`, reason.trim());
      navigate(`/appointments/${id}`);
    } catch {
      setErr('No se pudo registrar la sesión. Intenta de nuevo.');
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 5 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s800)', boxSizing: 'border-box', background: '#fff' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <History size={17} color="#d97706" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)' }}>Registrar sesión pasada</span>
          </div>
          <button onClick={onClose} disabled={saving} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px 24px' }}>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--s500)', lineHeight: 1.6 }}>
            Para sesiones que ocurrieron pero no se registraron a tiempo. La nota quedará marcada
            como <b>registro extemporáneo</b> con tu justificación, visible en la historia y en el PDF
            (Res. 1995/1999 — los registros deben ser simultáneos a la atención).
          </p>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Fecha real de la sesión</label>
            <BirthDateField value={date} onChange={setDate} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Hora aproximada <span style={{ color: 'var(--s400)', fontWeight: 400 }}>(opcional)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 220 }}>
              <select value={hour} onChange={e => setHour(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}</option>)}
              </select>
              <span style={{ fontWeight: 700, color: 'var(--s400)' }}>:</span>
              <select value={minute} onChange={e => setMinute(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['00', '15', '30', '45'].map(mm => <option key={mm} value={mm}>{mm}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Duración</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[45, 50, 60].map(d => (
                  <button key={d} type="button" onClick={() => setDuration(d)} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
                    border: `1.5px solid ${duration === d ? 'var(--teal)' : 'var(--s200)'}`,
                    background: duration === d ? 'var(--teal-l)' : '#fff',
                    color: duration === d ? 'var(--teal-d)' : 'var(--s500)',
                    fontWeight: duration === d ? 700 : 400,
                  }}>{d}m</button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Modalidad</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {([['IN_PERSON', 'Presencial'], ['VIRTUAL', 'Virtual']] as const).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setModality(val)} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
                    border: `1.5px solid ${modality === val ? 'var(--teal)' : 'var(--s200)'}`,
                    background: modality === val ? 'var(--teal-l)' : '#fff',
                    color: modality === val ? 'var(--teal-d)' : 'var(--s500)',
                    fontWeight: modality === val ? 700 : 400,
                  }}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Justificación del registro tardío <span style={{ color: 'var(--red)' }}>*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Ej.: corte de energía durante la consulta; sesión domiciliaria sin acceso al sistema…"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              required
            />
          </div>

          {err && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 12, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: '#991b1b' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{err}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: '#d97706', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? <Spinner size={14} color="#fff" /> : <History size={14} />}
              Registrar y escribir la nota
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
