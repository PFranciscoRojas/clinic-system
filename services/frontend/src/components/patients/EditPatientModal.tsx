import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Lock, X, AlertCircle } from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { validateBirthDate } from '@/lib/age';
import { BirthDateField } from './BirthDateField';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DOC_TYPES: { code: string; name: string; adultOnly: boolean }[] = [
  { code: 'CC',  name: 'CC — Cédula de Ciudadanía',           adultOnly: true  },
  { code: 'TI',  name: 'TI — Tarjeta de Identidad',           adultOnly: false },
  { code: 'CE',  name: 'CE — Cédula de Extranjería',          adultOnly: true  },
  { code: 'PA',  name: 'PA — Pasaporte',                      adultOnly: false },
  { code: 'RC',  name: 'RC — Registro Civil',                  adultOnly: false },
  { code: 'PPT', name: 'PPT — Permiso de Protección Temporal', adultOnly: false },
  { code: 'PEP', name: 'PEP — Permiso Especial de Permanencia', adultOnly: false },
];

function calcAge(birthDateStr: string): number {
  const b = new Date(birthDateStr + 'T12:00:00');
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  if (today < new Date(today.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  patient: Patient;
  onClose: () => void;
  onSaved: () => void;
  /** When set, shows a prominent banner explaining why data completion is required */
  requiredContext?: string;
}

export function EditPatientModal({ patient, onClose, onSaved, requiredContext }: Props) {
  const [docType,   setDocType]   = useState(patient.document_type_code ?? '');
  const [docNumber, setDocNumber] = useState(patient.document_number ?? '');
  const [firstName,  setFirstName]  = useState(patient.first_name);
  const [middleName, setMiddleName] = useState(patient.middle_name ?? '');
  const [paternalLn, setPaternalLn] = useState(patient.paternal_last_name);
  const [maternalLn, setMaternalLn] = useState(patient.maternal_last_name ?? '');
  const [phone,    setPhone]    = useState(patient.phone ?? '');
  const [email,    setEmail]    = useState(patient.email ?? '');
  const [address,  setAddress]  = useState(patient.address ?? '');
  const [birthDate, setBirthDate] = useState(patient.birth_date ?? '');
  const [gender,   setGender]   = useState(patient.gender ?? '');
  const [apiError, setApiError] = useState('');

  // Plausibility first (a half-typed year gives ages like 2025), then adult-only doc check
  const adultOnlyDoc = DOC_TYPES.find(d => d.code === docType)?.adultOnly ?? false;
  const plausibilityError = birthDate ? (validateBirthDate(birthDate) ?? '') : '';
  const ageError = plausibilityError || ((adultOnlyDoc && birthDate)
    ? (calcAge(birthDate) < 18 ? `${docType} requiere ser mayor de 18 años (edad calculada: ${calcAge(birthDate)})` : '')
    : '');

  const isValid = !!firstName && !!paternalLn && !ageError;

  const mutation = useMutation({
    mutationFn: () => patientsApi.update(patient.id, {
      document_type_code: docType     || undefined,
      document_number:    docNumber   || undefined,
      first_name:         firstName,
      middle_name:        middleName  || undefined,
      paternal_last_name: paternalLn,
      maternal_last_name: maternalLn  || undefined,
      phone:              phone       || undefined,
      email:              email       || undefined,
      address:            address     || undefined,
      birth_date:         birthDate   || undefined,
      gender:             gender      || undefined,
    }),
    onSuccess: () => { onSaved(); onClose(); },
    onError:   () => setApiError('No se pudo guardar. Intenta de nuevo.'),
  });

  const iLabel = (label: string, required?: boolean) => (
    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>
      {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );

  const iStyle: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 7,
    border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s800)',
    background: '#fff', boxSizing: 'border-box',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pencil size={16} color="var(--teal)" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)' }}>Editar datos administrativos</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Required context banner (e.g. "fill before starting session") */}
          {requiredContext && (
            <div style={{ display: 'flex', gap: 10, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '11px 14px' }}>
              <AlertCircle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                <strong>Acción requerida:</strong> {requiredContext}
              </p>
            </div>
          )}

          {/* Legal notice */}
          <div style={{ display: 'flex', gap: 10, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '11px 14px' }}>
            <Lock size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--teal-d)', lineHeight: 1.6 }}>
              <strong>Datos administrativos editables</strong> (Ley 1581/2012).
              Los registros clínicos son inmutables (Res. 1995/1999).
              Solo son obligatorios el nombre y el primer apellido.
            </p>
          </div>

          {/* Nombre */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre completo</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {iLabel('Primer nombre', true)}
                <input style={iStyle} value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                {iLabel('Segundo nombre')}
                <input style={iStyle} value={middleName} onChange={e => setMiddleName(e.target.value)} />
              </div>
              <div>
                {iLabel('Primer apellido', true)}
                <input style={iStyle} value={paternalLn} onChange={e => setPaternalLn(e.target.value)} />
              </div>
              <div>
                {iLabel('Segundo apellido')}
                <input style={iStyle} value={maternalLn} onChange={e => setMaternalLn(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Documento */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Documento de identidad <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', color: 'var(--s400)' }}>(opcional)</span></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {iLabel('Tipo')}
                <select style={iStyle} value={docType} onChange={e => setDocType(e.target.value)}>
                  <option value="">— Sin especificar —</option>
                  {DOC_TYPES.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
              </div>
              <div>
                {iLabel('Número')}
                <input style={iStyle} value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Ej. 1234567890" />
              </div>
            </div>
            {ageError && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={12} /> {ageError}
              </p>
            )}
          </div>

          {/* Contacto */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contacto y datos personales <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', color: 'var(--s400)' }}>(opcionales)</span></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {iLabel('Teléfono')}
                <input style={iStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
              </div>
              <div>
                {iLabel('Correo electrónico')}
                <input style={iStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                {iLabel('Fecha de nacimiento')}
                <BirthDateField value={birthDate} onChange={v => setBirthDate(v)} error={!!(adultOnlyDoc && birthDate && ageError)} />
              </div>
              <div>
                {iLabel('Género')}
                <input style={iStyle} value={gender} onChange={e => setGender(e.target.value)} placeholder="Según Decreto 1227/2015" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {iLabel('Dirección')}
                <input style={iStyle} value={address} onChange={e => setAddress(e.target.value)} />
              </div>
            </div>
          </div>

          {apiError && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} /> {apiError}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid var(--s100)' }}>
            <button
              onClick={onClose}
              style={{ padding: '9px 18px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => { setApiError(''); mutation.mutate(); }}
              disabled={mutation.isPending || !isValid}
              style={{ padding: '9px 18px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: mutation.isPending ? 'wait' : 'pointer', opacity: mutation.isPending || !isValid ? 0.7 : 1 }}
            >
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
