import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, AlertTriangle } from 'lucide-react';
import { patientsApi } from '@/api/patients';
import { Spinner } from '@/components/ui/Spinner';
import { RecordForm } from '@/components/clinical/RecordForm';

// Standalone record creation — walk-ins and retroactive notes don't have an
// appointment; the backend accepts records without one.
export function NewClinicalRecordPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: patient, isLoading, isError } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={28} color="var(--teal)" /></div>;
  if (isError || !patient) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 24 }}>
      <AlertTriangle size={16} /> Paciente no encontrado
    </div>
  );

  const displayName = [patient.first_name, patient.paternal_last_name].filter(Boolean).join(' ');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => navigate(`/patients/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={16} /> Volver al perfil
      </button>

      <div className="card" style={{ padding: '18px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={20} color="var(--teal)" />
        </div>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>Nuevo registro clínico</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--s500)' }}>{displayName} · sin cita asociada</p>
        </div>
      </div>

      <RecordForm patientId={id!} onSaved={() => navigate(`/patients/${id}`)} />
    </div>
  );
}
