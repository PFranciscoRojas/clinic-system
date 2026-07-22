import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Rocket, X } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { patientsApi } from '@/api/patients';
import { appointmentsApi } from '@/api/appointments';
import { clinicalRecordsApi } from '@/api/clinicalRecords';
import { serviceRatesApi } from '@/api/serviceRates';

// Guided first-steps checklist shown on the dashboard during the trial.
// Each step's done-state derives from real tenant data (not manual flags), so
// it survives devices and reflects actual activation. It disappears on its own
// once every step is done or the org converts to a paid plan.
export function FirstStepsCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('sghcp_first_steps_dismissed') === '1',
  );

  const trialing = user?.subscription_status === 'trialing';

  const { data: hasPatient } = useQuery({
    queryKey: ['first-steps', 'patient'],
    queryFn: () => patientsApi.list({ limit: 1 }).then(r => r.length > 0),
    enabled: trialing && !dismissed,
    staleTime: 60_000,
  });
  const { data: hasAppointment } = useQuery({
    queryKey: ['first-steps', 'appointment'],
    queryFn: () => appointmentsApi.list({ limit: 1 }).then(r => r.length > 0),
    enabled: trialing && !dismissed,
    staleTime: 60_000,
  });
  const { data: hasRecord } = useQuery({
    queryKey: ['first-steps', 'record'],
    queryFn: () => clinicalRecordsApi.listAll().then(r => r.length > 0),
    enabled: trialing && !dismissed,
    staleTime: 60_000,
  });
  const { data: hasRate } = useQuery({
    queryKey: ['first-steps', 'rate'],
    queryFn: () => serviceRatesApi.list().then(r => r.length > 0),
    enabled: trialing && !dismissed,
    staleTime: 60_000,
  });

  if (!trialing || dismissed) return null;

  const steps = [
    { done: !!hasPatient,     label: 'Crea tu primer paciente',        sub: 'Toma menos de un minuto',                      to: '/patients/new' },
    { done: !!hasAppointment, label: 'Agenda tu primera cita',         sub: 'Con un paciente o como reserva',               to: '/appointments/new' },
    { done: !!hasRecord,      label: 'Escribe tu primera nota clínica', sub: 'Puedes dictarla por audio y la IA la redacta', to: '/patients' },
    { done: !!hasRate,        label: 'Configura tus tarifas',          sub: 'Para facturar y recibir pagos en línea',       to: '/settings/billing' },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  const dismiss = () => {
    localStorage.setItem('sghcp_first_steps_dismissed', '1');
    setDismissed(true);
  };

  return (
    <div style={{
      border: '1px solid #cbc7ee', borderRadius: 12, background: '#f9f8fe',
      padding: '16px 18px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Rocket size={15} color="var(--teal)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>Primeros pasos</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#5b52ad', background: '#eceafc', padding: '2px 8px', borderRadius: 20 }}>
          {doneCount} de {steps.length}
        </span>
        <button
          onClick={dismiss}
          title="Ocultar"
          style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        {steps.map(step => (
          <button
            key={step.label}
            onClick={() => !step.done && navigate(step.to)}
            disabled={step.done}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 9, border: 'none',
              background: 'transparent', cursor: step.done ? 'default' : 'pointer',
              textAlign: 'left', transition: 'background .15s',
            }}
            onMouseEnter={e => { if (!step.done) e.currentTarget.style.background = '#eceafc'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {step.done
              ? <CheckCircle2 size={17} color="#10b981" style={{ flexShrink: 0 }} />
              : <Circle size={17} color="var(--s300)" style={{ flexShrink: 0 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: step.done ? 'var(--s400)' : 'var(--s800)',
                textDecoration: step.done ? 'line-through' : 'none',
              }}>
                {step.label}
              </div>
              {!step.done && <div style={{ fontSize: 11.5, color: 'var(--s500)' }}>{step.sub}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
