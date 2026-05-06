import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, User, Phone, Mail, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import { patientsApi, type CreatePatientBody } from '@/api/patients';
import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';

const DOCUMENT_TYPES = [
  { code: 'CC',  name: 'Cédula de Ciudadanía' },
  { code: 'TI',  name: 'Tarjeta de Identidad' },
  { code: 'CE',  name: 'Cédula de Extranjería' },
  { code: 'PA',  name: 'Pasaporte' },
  { code: 'RC',  name: 'Registro Civil de Nacimiento' },
  { code: 'PPT', name: 'Permiso de Protección Temporal' },
  { code: 'PEP', name: 'Permiso Especial de Permanencia' },
];

export function NewPatientPage() {
  const navigate = useNavigate();

  const [docTypeCode, setDocTypeCode] = useState('');
  const [docNumber, setDocNumber]   = useState('');
  const [firstName, setFirstName]   = useState('');
  const [middleName, setMiddleName] = useState('');
  const [pLastName, setPLastName]   = useState('');
  const [mLastName, setMLLastName]  = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [birthDate, setBirthDate]   = useState('');
  const [gender, setGender]         = useState('');
  const [address, setAddress]       = useState('');
  const [notes, setNotes]           = useState('');
  const [ecName, setEcName]         = useState('');
  const [ecPhone, setEcPhone]       = useState('');
  const [error, setError]           = useState('');

  const { mutate: create, isPending, isSuccess } = useMutation({
    mutationFn: (body: CreatePatientBody) => patientsApi.create(body),
    onSuccess: (data) => {
      setTimeout(() => navigate(`/patients/${data.id}`), 1500);
    },
    onError: (err: Error) => setError(err.message || 'Error al crear el paciente'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!docTypeCode) { setError('Selecciona el tipo de documento'); return; }
    if (!docNumber.trim()) { setError('El número de documento es requerido'); return; }
    if (!firstName.trim()) { setError('El primer nombre es requerido'); return; }
    if (!pLastName.trim()) { setError('El apellido paterno es requerido'); return; }

    create({
      document_type_code: docTypeCode,
      document_number: docNumber.trim(),
      first_name: firstName.trim(),
      middle_name: middleName.trim() || undefined,
      paternal_last_name: pLastName.trim(),
      maternal_last_name: mLastName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      birth_date: birthDate || undefined,
      gender: gender.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      emergency_contact_name: ecName.trim() || undefined,
      emergency_contact_phone: ecPhone.trim() || undefined,
    });
  };

  if (isSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <CheckCircle2 size={36} color="#059669" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>¡Paciente registrado!</h2>
        <p style={{ color: 'var(--s400)', fontSize: 14, margin: 0 }}>Redirigiendo al perfil…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: 0 }}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 6px' }}>Nuevo paciente</h1>
      <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 28px' }}>Registra los datos del paciente</p>

      <form onSubmit={handleSubmit}>
        {/* Documento */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={16} color="var(--teal)" /> Identificación
          </h3>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>
              Tipo de documento <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DOCUMENT_TYPES.map(dt => (
                <button
                  key={dt.code}
                  type="button"
                  onClick={() => setDocTypeCode(dt.code)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all .1s',
                    border: `1.5px solid ${docTypeCode === dt.code ? 'var(--teal)' : 'var(--s200)'}`,
                    background: docTypeCode === dt.code ? 'var(--teal-10)' : '#fff',
                    color: docTypeCode === dt.code ? 'var(--teal)' : 'var(--s600)',
                    fontWeight: docTypeCode === dt.code ? 600 : 400,
                  }}
                >
                  {dt.code} — {dt.name}
                </button>
              ))}
            </div>
          </div>
          <Field label="Número de documento" value={docNumber} onChange={setDocNumber} placeholder="12345678" required />
        </div>

        {/* Nombre */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px' }}>Nombre completo</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Primer nombre" value={firstName} onChange={setFirstName} placeholder="Juan" required />
            <Field label="Segundo nombre" value={middleName} onChange={setMiddleName} placeholder="Carlos (opcional)" />
            <Field label="Apellido paterno" value={pLastName} onChange={setPLastName} placeholder="Pérez" required />
            <Field label="Apellido materno" value={mLastName} onChange={setMLLastName} placeholder="García (opcional)" />
          </div>
        </div>

        {/* Contacto */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={16} color="var(--teal)" /> Contacto
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Correo electrónico" value={email} onChange={setEmail} icon={Mail} type="email" placeholder="juan@ejemplo.com" />
            <Field label="Teléfono" value={phone} onChange={setPhone} icon={Phone} placeholder="3001234567" />
            <Field label="Fecha de nacimiento" value={birthDate} onChange={setBirthDate} type="date" />
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 8 }}>Género</label>
              <input
                value={gender}
                onChange={e => setGender(e.target.value)}
                placeholder="Texto libre (Ley 1227/2015)"
                style={{ width: '100%', padding: '11px 14px', borderRadius: 11, border: '1.5px solid var(--s200)', fontSize: 14, background: 'var(--s50)', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Field label="Dirección" value={address} onChange={setAddress} icon={MapPin} placeholder="Calle 123 # 45-67, Bogotá" />
          </div>
        </div>

        {/* Emergencia */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px' }}>Contacto de emergencia</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Nombre" value={ecName} onChange={setEcName} placeholder="María García" />
            <Field label="Teléfono" value={ecPhone} onChange={setEcPhone} placeholder="3009876543" />
          </div>
        </div>

        {/* Notas */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 12px' }}>Notas clínicas (opcional)</h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Motivo de consulta inicial, antecedentes relevantes…"
            rows={3}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 11, border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s700)', resize: 'vertical', background: 'var(--s50)', boxSizing: 'border-box' }}
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
              flex: 2, padding: 13, borderRadius: 11,
              background: isPending ? 'var(--s200)' : 'var(--teal)',
              color: '#fff', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
              fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isPending ? <><Spinner size={18} /> Guardando…</> : 'Registrar paciente'}
          </button>
        </div>
      </form>
    </div>
  );
}
