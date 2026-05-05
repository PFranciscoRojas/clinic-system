import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock, User, Video, Stethoscope, AlertCircle, CheckCircle2 } from 'lucide-react';
import { appointmentsApi } from '@/api/appointments';
import { patientsApi } from '@/api/patients';
import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';

type Modality = 'IN_PERSON' | 'VIDEO_CALL' | 'PHONE_CALL';
const DURATIONS = [30, 45, 60, 90, 120];

export function NewAppointmentPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prePatientId = params.get('patient_id') ?? '';

  const [patientSearch, setPatientSearch] = useState('');
  const [patientId, setPatientId]         = useState(prePatientId);
  const [date, setDate]                   = useState('');
  const [time, setTime]                   = useState('');
  const [duration, setDuration]           = useState(60);
  const [modality, setModality]           = useState<Modality>('IN_PERSON');
  const [location, setLocation]           = useState('');
  const [notes, setNotes]                 = useState('');
  const [error, setError]                 = useState('');

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['patients', 'search', patientSearch],
    queryFn: () => patientsApi.search({ q: patientSearch, limit: 8 }),
    enabled: patientSearch.length >= 2 && !patientId,
  });

  const { data: selectedPatient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.get(patientId),
    enabled: !!patientId,
  });

  const { mutate: create, isPending, isSuccess } = useMutation({
    mutationFn: appointmentsApi.create,
    onSuccess: () => {
      setTimeout(() => navigate('/'), 1500);
    },
    onError: (err: Error) => setError(err.message || 'Error al crear la cita'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!patientId) { setError('Selecciona un paciente'); return; }
    if (!date || !time) { setError('La fecha y hora son requeridas'); return; }
    const scheduled_at = new Date(`${date}T${time}:00`).toISOString();
    create({ patient_id: patientId, scheduled_at, duration_min: duration, modality, location_or_link: location, notes });
  };

  if (isSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <CheckCircle2 size={36} color="#059669" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>¡Cita agendada!</h2>
        <p style={{ color: 'var(--s400)', fontSize: 14, margin: 0 }}>Redirigiendo a la agenda…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: 0 }}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 6px' }}>Nueva cita</h1>
      <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 28px' }}>
        Completa los datos para agendar la consulta
      </p>

      <form onSubmit={handleSubmit}>
        {/* Patient selector */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={16} color="var(--teal)" /> Paciente
          </h3>

          {patientId && selectedPatient ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--teal-10)', borderRadius: 10, border: '1.5px solid var(--teal)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={18} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>
                  {selectedPatient.paternal_last_name} {selectedPatient.maternal_last_name}, {selectedPatient.first_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setPatientId(''); setPatientSearch(''); }}
                style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <Field
                label="Buscar paciente"
                value={patientSearch}
                onChange={setPatientSearch}
                icon={User}
                placeholder="Escribe el apellido o número de documento…"
              />
              {searching && <Spinner size={14} color="var(--teal)" />}
              {searchResults && searchResults.length > 0 && !patientId && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
                  border: '1.5px solid var(--s200)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 10, maxHeight: 260, overflow: 'auto',
                }}>
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPatientId(p.id); setPatientSearch(''); }}
                      style={{
                        width: '100%', padding: '12px 16px', textAlign: 'left', background: 'none',
                        border: 'none', borderBottom: '1px solid var(--s100)', cursor: 'pointer', fontSize: 14,
                        color: 'var(--s700)', fontWeight: 500,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {p.paternal_last_name} {p.maternal_last_name}, {p.first_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date & time */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={16} color="var(--teal)" /> Fecha y hora
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Fecha" value={date} onChange={setDate} type="date" required />
            <Field label="Hora" value={time} onChange={setTime} type="time" required />
          </div>

          {/* Duration */}
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 10 }}>
              Duración
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {DURATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${duration === d ? 'var(--teal)' : 'var(--s200)'}`,
                    background: duration === d ? 'var(--teal-10)' : '#fff',
                    color: duration === d ? 'var(--teal)' : 'var(--s600)',
                    fontSize: 13, fontWeight: duration === d ? 600 : 400, cursor: 'pointer', transition: 'all .1s',
                  }}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modality */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="var(--teal)" /> Modalidad
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {([
              { value: 'IN_PERSON',  label: 'Presencial',    Icon: Stethoscope },
              { value: 'VIDEO_CALL', label: 'Videollamada',  Icon: Video       },
              { value: 'PHONE_CALL', label: 'Llamada',       Icon: Clock       },
            ] as const).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setModality(value)}
                style={{
                  padding: '14px 12px', borderRadius: 10, border: `1.5px solid ${modality === value ? 'var(--teal)' : 'var(--s200)'}`,
                  background: modality === value ? 'var(--teal-10)' : '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                <Icon size={20} color={modality === value ? 'var(--teal)' : 'var(--s400)'} />
                <span style={{ fontSize: 12, fontWeight: 600, color: modality === value ? 'var(--teal)' : 'var(--s600)' }}>{label}</span>
              </button>
            ))}
          </div>
          <Field
            label={modality === 'VIDEO_CALL' ? 'Enlace de videollamada' : 'Consultorio / ubicación'}
            value={location}
            onChange={setLocation}
            placeholder={modality === 'VIDEO_CALL' ? 'https://meet.google.com/...' : 'Consultorio 3, piso 2'}
          />
        </div>

        {/* Notes */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 12px' }}>Notas (opcional)</h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Motivo de consulta, recordatorios previos…"
            rows={3}
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 11,
              border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s700)',
              resize: 'vertical', background: 'var(--s50)', boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: '12px 16px', background: '#fef2f2', borderRadius: 10, marginBottom: 16 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{
              flex: 2, padding: 13, borderRadius: 11, background: isPending ? 'var(--s200)' : 'var(--teal)',
              color: '#fff', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
              fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isPending ? <><Spinner size={18} /> Guardando…</> : 'Confirmar cita'}
          </button>
        </div>
      </form>
    </div>
  );
}
