import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarDays, User, Video, Stethoscope,
  Phone, AlertCircle, CheckCircle2, Search, X, ChevronDown,
} from 'lucide-react';
import { appointmentsApi, type AppointmentModality } from '@/api/appointments';
import { patientsApi, type Patient } from '@/api/patients';
import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';

const DURATIONS = [30, 45, 60, 90, 120];

const MODALITIES: { value: AppointmentModality; label: string; Icon: React.ElementType; desc: string }[] = [
  { value: 'IN_PERSON', label: 'Presencial',   Icon: Stethoscope, desc: 'Consultorio' },
  { value: 'VIRTUAL',   label: 'Videollamada', Icon: Video,       desc: 'En línea'    },
  { value: 'HYBRID',    label: 'Híbrida',      Icon: Phone,       desc: 'Mixta'       },
];

export function NewAppointmentPage() {
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const [params]       = useSearchParams();
  const prePatientId   = params.get('patient_id') ?? '';

  // Patient picker state
  const [patientId,       setPatientId]       = useState(prePatientId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ,    setPickerQ]    = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Form state
  const [date,     setDate]     = useState('');
  const [time,     setTime]     = useState('');
  const [duration, setDuration] = useState(60);
  const [modality, setModality] = useState<AppointmentModality>('IN_PERSON');
  const [location, setLocation] = useState('');
  const [notes,    setNotes]    = useState('');
  const [error,    setError]    = useState('');

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load all patients for the picker list
  const { data: allPatients = [], isLoading: loadingAll } = useQuery({
    queryKey: ['patients', 'list-picker'],
    queryFn: () => patientsApi.list({ limit: 100 }),
    staleTime: 60_000,
  });

  // Load the selected patient info
  const { data: selectedPatient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.get(patientId),
    enabled: !!patientId,
  });

  // Filter patients locally — list is already loaded
  const filtered = pickerQ.trim().length === 0
    ? allPatients
    : allPatients.filter(p => {
        const q = pickerQ.toLowerCase();
        return (
          p.paternal_last_name?.toLowerCase().includes(q) ||
          p.maternal_last_name?.toLowerCase().includes(q) ||
          p.first_name?.toLowerCase().includes(q) ||
          p.middle_name?.toLowerCase().includes(q)
        );
      });

  const { mutate: create, isPending, isSuccess } = useMutation({
    mutationFn: appointmentsApi.create,
    onSuccess: () => setTimeout(() => navigate('/'), 1500),
    onError: (err: Error) => setError(err.message || 'Error al crear la cita'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!patientId)    { setError('Selecciona un paciente'); return; }
    if (!date || !time){ setError('La fecha y hora son requeridas'); return; }
    const scheduled_at = new Date(`${date}T${time}:00`).toISOString();
    create({ patient_id: patientId, staff_id: user!.user_id, scheduled_at, duration_min: duration, modality, location_or_link: location, notes });
  };

  const selectPatient = (p: Patient) => {
    setPatientId(p.id);
    setPickerOpen(false);
    setPickerQ('');
  };

  const clearPatient = () => {
    setPatientId('');
    setPickerOpen(true);
  };

  if (isSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <CheckCircle2 size={36} color="#059669" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>¡Cita agendada!</h2>
        <p style={{ color: 'var(--s400)', fontSize: 14 }}>Redirigiendo a la agenda…</p>
      </div>
    );
  }

  const fullName = (p: Patient) =>
    [p.paternal_last_name, p.maternal_last_name].filter(Boolean).join(' ')
    + ', ' + [p.first_name, p.middle_name].filter(Boolean).join(' ');

  const initials = (p: Patient) =>
    [p.paternal_last_name?.[0], p.first_name?.[0]].filter(Boolean).join('').toUpperCase();

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: 0 }}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 4px' }}>Nueva cita</h1>
      <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 28px' }}>Completa los datos para agendar la consulta</p>

      <form onSubmit={handleSubmit}>
        {/* ── Paciente ─────────────────────────────────────── */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--s500)', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <User size={13} color="var(--teal)" /> Paciente
          </h3>

          {patientId && selectedPatient ? (
            /* Selected patient card */
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--teal-10)', borderRadius: 12, border: '1.5px solid rgba(20,184,166,0.3)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {initials(selectedPatient)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fullName(selectedPatient)}
                </p>
                {selectedPatient.email && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--s500)' }}>{selectedPatient.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={clearPatient}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 4 }}
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            /* Patient picker */
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setPickerOpen(v => !v)}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 11,
                  border: `1.5px solid ${pickerOpen ? 'var(--teal)' : 'var(--s200)'}`,
                  background: pickerOpen ? '#fff' : 'var(--s50)',
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  boxShadow: pickerOpen ? '0 0 0 3px rgba(20,184,166,.12)' : 'none',
                  transition: 'all .15s',
                }}
              >
                <User size={16} color={pickerOpen ? 'var(--teal)' : 'var(--s400)'} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--s400)' }}>
                  Seleccionar paciente…
                </span>
                <ChevronDown size={15} color="var(--s400)" style={{ transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>

              {pickerOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: '#fff', borderRadius: 14, border: '1.5px solid var(--s200)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden',
                }}>
                  {/* Search inside picker */}
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s50)', borderRadius: 9, padding: '7px 12px' }}>
                      <Search size={14} color="var(--s400)" />
                      <input
                        autoFocus
                        value={pickerQ}
                        onChange={e => setPickerQ(e.target.value)}
                        placeholder="Filtrar por nombre o apellido…"
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--s700)', outline: 'none' }}
                      />
                      {pickerQ && <button type="button" onClick={() => setPickerQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={12} color="var(--s400)" /></button>}
                    </div>
                  </div>

                  {/* Patient list */}
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {loadingAll ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                        <Spinner size={20} color="var(--teal)" />
                      </div>
                    ) : filtered.length === 0 ? (
                      <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--s400)', fontSize: 13 }}>
                        {pickerQ ? `Sin resultados para "${pickerQ}"` : 'No hay pacientes registrados'}
                      </div>
                    ) : (
                      filtered.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPatient(p)}
                          style={{
                            width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none',
                            border: 'none', borderBottom: '1px solid var(--s100)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 10, transition: 'background .1s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--s50)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: stringToColor(p.paternal_last_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                            {initials(p)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {fullName(p)}
                            </p>
                            {p.email && <p style={{ margin: 0, fontSize: 11, color: 'var(--s400)' }}>{p.email}</p>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Fecha y hora ─────────────────────────────────── */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--s500)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <CalendarDays size={13} color="var(--teal)" /> Fecha y hora
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Field label="Fecha" value={date} onChange={setDate} type="date" required />
            <Field label="Hora de inicio" value={time} onChange={setTime} type="time" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 10 }}>
              Duración
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DURATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all .1s',
                    border: `1.5px solid ${duration === d ? 'var(--teal)' : 'var(--s200)'}`,
                    background: duration === d ? 'var(--teal-10)' : '#fff',
                    color: duration === d ? 'var(--teal)' : 'var(--s600)',
                    fontWeight: duration === d ? 600 : 400,
                  }}
                >
                  {d < 60 ? `${d} min` : `${d / 60}h${d % 60 ? ` ${d % 60}min` : ''}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Modalidad ────────────────────────────────────── */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--s500)', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Modalidad
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {MODALITIES.map(({ value, label, Icon, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setModality(value)}
                style={{
                  padding: '16px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                  border: `1.5px solid ${modality === value ? 'var(--teal)' : 'var(--s200)'}`,
                  background: modality === value ? 'var(--teal-10)' : '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: modality === value ? 'rgba(20,184,166,0.15)' : 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={modality === value ? 'var(--teal)' : 'var(--s400)'} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: modality === value ? 'var(--teal)' : 'var(--s700)' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--s400)' }}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
          <Field
            label={modality === 'VIRTUAL' ? 'Enlace de videollamada' : 'Consultorio / ubicación'}
            value={location}
            onChange={setLocation}
            placeholder={modality === 'VIRTUAL' ? 'https://meet.google.com/abc-def' : 'Consultorio 3, piso 2'}
          />
        </div>

        {/* ── Notas ────────────────────────────────────────── */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--s500)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Notas internas (opcional)
          </h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Motivo de consulta, recordatorios previos, indicaciones especiales…"
            rows={3}
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 11,
              border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s700)',
              resize: 'vertical', background: 'var(--s50)', boxSizing: 'border-box',
              lineHeight: 1.6, outline: 'none', transition: 'border-color .15s',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--teal)')}
            onBlur={e => (e.target.style.borderColor = 'var(--s200)')}
          />
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: '12px 16px', background: '#fef2f2', borderRadius: 10, marginBottom: 16, border: '1px solid #fecaca' }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, transition: 'background .1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s200)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--s100)')}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{
              flex: 2, padding: 13, borderRadius: 11,
              background: isPending ? 'var(--s200)' : 'var(--teal)',
              color: '#fff', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
              fontSize: 15, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: isPending ? 'none' : '0 2px 8px rgba(20,184,166,0.3)',
              transition: 'all .15s',
            }}
          >
            {isPending ? <><Spinner size={18} /> Guardando…</> : 'Confirmar cita'}
          </button>
        </div>
      </form>
    </div>
  );
}

function stringToColor(s: string = '') {
  const palette = ['#0ea5e9','#8b5cf6','#ec4899','#f59e0b','#10b981','#6366f1','#14b8a6'];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}
