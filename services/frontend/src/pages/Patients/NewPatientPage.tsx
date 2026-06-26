import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft, User, Phone, Mail, MapPin, AlertCircle,
  CheckCircle2, CreditCard, HeartPulse, Info,
} from 'lucide-react';
import { patientsApi, type CreatePatientBody } from '@/api/patients';
import { appointmentsApi } from '@/api/appointments';
import { validateBirthDate } from '@/lib/age';
import { useIsMobile } from '@/lib/useMediaQuery';
import { BirthDateField } from '@/components/patients/BirthDateField';
import { Spinner } from '@/components/ui/Spinner';

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { code: 'CC',  name: 'Cédula de Ciudadanía',         adultOnly: true  },
  { code: 'TI',  name: 'Tarjeta de Identidad',          adultOnly: false },
  { code: 'CE',  name: 'Cédula de Extranjería',         adultOnly: true  },
  { code: 'PA',  name: 'Pasaporte',                     adultOnly: true  },
  { code: 'RC',  name: 'Registro Civil de Nacimiento',  adultOnly: false },
  { code: 'PPT', name: 'Permiso de Protección Temporal', adultOnly: true },
  { code: 'PEP', name: 'Permiso Especial de Permanencia', adultOnly: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(birthIso: string): number {
  const b = new Date(birthIso + 'T12:00:00');
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

function validateAge(birthDate: string, docType: string): string | null {
  if (!birthDate || !docType) return null;
  const age = calcAge(birthDate);
  const dt = DOCUMENT_TYPES.find(d => d.code === docType);
  if (!dt) return null;
  if (dt.adultOnly && age < 18)
    return `${docType} es para mayores de 18 años. Edad calculada: ${age} año${age !== 1 ? 's' : ''}.`;
  if (!dt.adultOnly && age >= 18)
    return `${docType} es para menores de 18 años. Edad calculada: ${age} año${age !== 1 ? 's' : ''}.`;
  return null;
}

function validatePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10)
    return 'El teléfono colombiano debe tener 10 dígitos.';
  if (!/^[13456789]/.test(digits))
    return 'Número inválido. Celular: empieza en 3. Fijo: empieza con indicativo de ciudad.';
  return null;
}

function validateEmail(email: string): string | null {
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Correo electrónico inválido.';
}

function validateDocNumber(num: string, docType: string): string | null {
  if (!num || !docType) return null;
  if (['CC', 'TI'].includes(docType) && !/^\d+$/.test(num))
    return `El número de ${docType} solo debe contener dígitos.`;
  if (num.trim().length < 4)
    return 'El número de documento parece muy corto.';
  return null;
}

// ─── Field component ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  icon?: React.ElementType;
  max?: string;
  min?: string;
  id?: string;
}

function Field({ label, value, onChange, placeholder, type = 'text', required, error, hint, icon: Icon, max, min, id }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

  return (
    <div id={id}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: hasError ? 'var(--red)' : 'var(--s700)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        border: `1.5px solid ${hasError ? 'var(--red)' : focused ? 'var(--teal)' : 'var(--s200)'}`,
        borderRadius: 10, padding: '10px 14px', background: '#fff',
        boxShadow: focused ? `0 0 0 3px ${hasError ? 'rgba(239,68,68,0.12)' : 'rgba(13,148,136,0.12)'}` : 'none',
        transition: 'all 0.15s',
      }}>
        {Icon && <Icon size={14} color={hasError ? 'var(--red)' : focused ? 'var(--teal)' : 'var(--s400)'} />}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          max={max}
          min={min}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: 'var(--s800)', background: 'transparent' }}
        />
      </div>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 11, color: 'var(--red)' }}>
          <AlertCircle size={11} />{error}
        </div>
      )}
      {hint && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 11, color: 'var(--s400)' }}>
          <Info size={11} />{hint}
        </div>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={14} color="#fff" />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>{title}</span>
    </div>
  );
}

// ─── NewPatientPage ───────────────────────────────────────────────────────────

export function NewPatientPage() {
  const navigate = useNavigate();
  const birthWrapRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  // Set when registering the patient for a guest reservation — after creating,
  // the patient is linked to that appointment and we return to it.
  const [searchParams] = useSearchParams();
  const returnAppointmentId = searchParams.get('appointment_id');

  const [docTypeCode, setDocTypeCode] = useState('CC');
  const [docNumber,   setDocNumber]   = useState('');
  const [firstName,   setFirstName]   = useState('');
  const [middleName,  setMiddleName]  = useState('');
  const [pLastName,   setPLastName]   = useState('');
  const [mLastName,   setMLastName]   = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [birthDate,   setBirthDate]   = useState('');
  const [gender,      setGender]      = useState('');
  const [address,     setAddress]     = useState('');
  const [notes,       setNotes]       = useState('');
  const [ecName,      setEcName]      = useState('');
  const [ecPhone,     setEcPhone]     = useState('');
  const [ecRelation,  setEcRelation]  = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [education,     setEducation]     = useState('');
  const [occupation,    setOccupation]    = useState('');

  // Per-field errors (set on submit attempt)
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Derived live validations ───────────────────────────────────────────────
  const ageError   = (birthDate ? validateBirthDate(birthDate) : null) ?? validateAge(birthDate, docTypeCode);
  const phoneError = validatePhone(phone);
  const emailError = validateEmail(email);
  const docNumErr  = validateDocNumber(docNumber, docTypeCode);
  const age        = birthDate ? calcAge(birthDate) : null;

  // Max date for birth_date field: today
  const { mutate: create, isPending, isSuccess } = useMutation({
    mutationFn: (body: CreatePatientBody) => patientsApi.create(body),
    onSuccess: async (data) => {
      if (returnAppointmentId) {
        try { await appointmentsApi.assignPatient(returnAppointmentId, data.id); } catch { /* patient created; link manually */ }
        setTimeout(() => navigate(`/appointments/${returnAppointmentId}`), 1500);
        return;
      }
      setTimeout(() => navigate(`/patients/${data.id}`), 1500);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!docTypeCode)          newErrors.docType   = 'Selecciona el tipo de documento.';
    if (!docNumber.trim())     newErrors.docNumber = 'El número de documento es requerido.';
    else if (docNumErr)        newErrors.docNumber = docNumErr;
    if (!firstName.trim())     newErrors.firstName = 'El primer nombre es requerido.';
    if (!pLastName.trim())     newErrors.pLastName = 'El primer apellido es requerido.';
    if (!birthDate)            newErrors.birthDate = 'La fecha de nacimiento es requerida.';
    // BirthDateField only emits complete dates, so a partial date is impossible.
    else if (ageError)         newErrors.birthDate = ageError;
    if (!phone.trim())         newErrors.phone     = 'El teléfono es requerido.';
    else if (phoneError)       newErrors.phone     = phoneError;
    if (emailError)            newErrors.email     = emailError;

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      // Take the user to the first field with an error — a blocked save must
      // never look like nothing happened.
      const ORDER = ['docType', 'docNumber', 'firstName', 'pLastName', 'birthDate', 'phone', 'email'];
      const firstKey = ORDER.find(k => newErrors[k]);
      if (firstKey) {
        const el = firstKey === 'birthDate' ? birthWrapRef.current : document.getElementById(`fld-${firstKey}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el?.querySelector('input, select') as HTMLElement | null)?.focus?.();
      }
      return;
    }

    create({
      document_type_code:  docTypeCode,
      document_number:     docNumber.trim(),
      first_name:          firstName.trim(),
      middle_name:         middleName.trim()  || undefined,
      paternal_last_name:  pLastName.trim(),
      maternal_last_name:  mLastName.trim()   || undefined,
      email:               email.trim()       || undefined,
      phone:               phone.trim(),
      birth_date:          birthDate,
      gender:              gender.trim()      || undefined,
      address:             address.trim()     || undefined,
      notes:               notes.trim()       || undefined,
      emergency_contact_name:  ecName.trim()  || undefined,
      emergency_contact_phone: ecPhone.trim() || undefined,
      emergency_contact_relationship: ecRelation.trim() || undefined,
      marital_status: maritalStatus.trim() || undefined,
      education:      education.trim()     || undefined,
      occupation:     occupation.trim()    || undefined,
    });
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          boxShadow: '0 8px 24px rgba(13,148,136,0.35)',
        }}>
          <CheckCircle2 size={36} color="#fff" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>¡Paciente registrado!</h2>
        <p style={{ color: 'var(--s400)', fontSize: 14, margin: 0 }}>Redirigiendo al perfil…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '0 12px 32px' : '0 0 40px' }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: 0 }}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--s800)', margin: '0 0 4px' }}>Nuevo paciente</h1>
      <p style={{ color: 'var(--s500)', fontSize: 14, margin: '0 0 28px' }}>Todos los campos marcados con * son obligatorios.</p>

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Identificación ──────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionHeader icon={CreditCard} title="Identificación" />

          <div id="fld-docType" style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: errors.docType ? 'var(--red)' : 'var(--s700)', marginBottom: 8 }}>
              Tipo de documento <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              value={docTypeCode}
              onChange={e => { setDocTypeCode(e.target.value); setErrors(er => ({ ...er, docType: '' })); }}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: `1.5px solid ${errors.docType ? 'var(--red)' : 'var(--s200)'}`,
                fontSize: 14, color: 'var(--s800)', background: '#fff', cursor: 'pointer', outline: 'none',
              }}
            >
              {DOCUMENT_TYPES.map(dt => (
                <option key={dt.code} value={dt.code}>{dt.code} — {dt.name}</option>
              ))}
            </select>
            {errors.docType && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, color: 'var(--red)' }}>
                <AlertCircle size={11} />{errors.docType}
              </div>
            )}
          </div>

          <Field
            id="fld-docNumber"
            label="Número de documento"
            value={docNumber}
            onChange={v => { setDocNumber(v); setErrors(e => ({ ...e, docNumber: '' })); }}
            placeholder="12345678"
            required
            error={errors.docNumber}
            hint={docTypeCode ? `Ingresa el número tal como aparece en el ${docTypeCode}.` : undefined}
          />
        </div>

        {/* ── Nombre completo ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionHeader icon={User} title="Nombre completo" />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : 16 }}>
            <Field id="fld-firstName" label="Primer nombre" value={firstName} onChange={v => { setFirstName(v); setErrors(e => ({ ...e, firstName: '' })); }} placeholder="Juan" required error={errors.firstName} />
            <Field label="Segundo nombre" value={middleName} onChange={setMiddleName} placeholder="Carlos (opcional)" />
            <Field id="fld-pLastName" label="Primer apellido" value={pLastName} onChange={v => { setPLastName(v); setErrors(e => ({ ...e, pLastName: '' })); }} placeholder="Pérez" required error={errors.pLastName} />
            <Field label="Segundo apellido" value={mLastName} onChange={setMLastName} placeholder="García (opcional)" />
          </div>
        </div>

        {/* ── Datos personales ────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionHeader icon={Phone} title="Contacto y datos personales" />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : 16 }}>
            <Field
              id="fld-email"
              label="Correo electrónico"
              value={email}
              onChange={v => { setEmail(v); setErrors(e => ({ ...e, email: '' })); }}
              icon={Mail}
              type="email"
              placeholder="juan@ejemplo.com"
              error={errors.email}
            />
            <Field
              id="fld-phone"
              label="Teléfono"
              value={phone}
              onChange={v => { setPhone(v); setErrors(e => ({ ...e, phone: '' })); }}
              icon={Phone}
              placeholder="3001234567"
              required
              error={errors.phone}
              hint="10 dígitos. Celular empieza en 3."
            />

            {/* Birth date + age preview */}
            <div ref={birthWrapRef}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: errors.birthDate ? 'var(--red)' : 'var(--s700)', marginBottom: 6 }}>
                Fecha de nacimiento<span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>
              </label>
              <BirthDateField
                value={birthDate}
                onChange={v => { setBirthDate(v); setErrors(e => ({ ...e, birthDate: '' })); }}
                error={errors.birthDate}
              />
              {errors.birthDate && (
                <div style={{ marginTop: 5, fontSize: 12, color: 'var(--red)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertCircle size={12} />{errors.birthDate}
                </div>
              )}
              {age !== null && !errors.birthDate && (
                <div style={{ marginTop: 5, fontSize: 12, color: ageError ? 'var(--red)' : 'var(--teal-d)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {ageError
                    ? <><AlertCircle size={12} />{ageError}</>
                    : <><CheckCircle2 size={12} />{age} año{age !== 1 ? 's' : ''}</>
                  }
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>
                Género
              </label>
              <input
                value={gender}
                onChange={e => setGender(e.target.value)}
                placeholder="Texto libre (Decreto 1227/2015)"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s800)', background: '#fff', boxSizing: 'border-box', outline: 'none' }}
              />
              <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Info size={10} />Campo libre por Decreto 1227/2015 — identidad de género.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Field label="Dirección" value={address} onChange={setAddress} icon={MapPin} placeholder="Calle 123 # 45-67, Bogotá" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Estado civil</label>
              <select
                value={maritalStatus}
                onChange={e => setMaritalStatus(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s800)', background: '#fff', cursor: 'pointer', outline: 'none' }}
              >
                <option value="">— Sin especificar —</option>
                <option value="Soltero/a">Soltero/a</option>
                <option value="Casado/a">Casado/a</option>
                <option value="Unión libre">Unión libre</option>
                <option value="Separado/a">Separado/a</option>
                <option value="Divorciado/a">Divorciado/a</option>
                <option value="Viudo/a">Viudo/a</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Escolaridad</label>
              <select
                value={education}
                onChange={e => setEducation(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s800)', background: '#fff', cursor: 'pointer', outline: 'none' }}
              >
                <option value="">— Sin especificar —</option>
                <option value="Primaria">Primaria</option>
                <option value="Bachillerato">Bachillerato</option>
                <option value="Técnico / Tecnólogo">Técnico / Tecnólogo</option>
                <option value="Universitario">Universitario</option>
                <option value="Posgrado">Posgrado</option>
                <option value="Ninguno">Ninguno</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Ocupación actual" value={occupation} onChange={setOccupation} placeholder="Ej. Docente, estudiante, comerciante…" />
            </div>
          </div>
        </div>

        {/* ── Contacto de emergencia ──────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionHeader icon={HeartPulse} title="Contacto de emergencia" />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : 16 }}>
            <Field label="Nombre" value={ecName} onChange={setEcName} placeholder="María García" />
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>Parentesco</label>
              <select
                value={ecRelation}
                onChange={e => setEcRelation(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s800)', background: '#fff', cursor: 'pointer', outline: 'none' }}
              >
                <option value="">— Sin especificar —</option>
                <option value="Padre">Padre</option>
                <option value="Madre">Madre</option>
                <option value="Cónyuge">Cónyuge</option>
                <option value="Hermano/a">Hermano/a</option>
                <option value="Hijo/a">Hijo/a</option>
                <option value="Amigo/a">Amigo/a</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <Field
              label="Teléfono"
              value={ecPhone}
              onChange={setEcPhone}
              icon={Phone}
              placeholder="3009876543"
              error={ecPhone ? (validatePhone(ecPhone) ?? undefined) : undefined}
            />
          </div>
        </div>

        {/* ── Notas clínicas ──────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionHeader icon={HeartPulse} title="Notas clínicas (opcional)" />
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Motivo de consulta inicial, antecedentes relevantes, derivación…"
            rows={3}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--s200)',
              fontSize: 14, color: 'var(--s700)', resize: 'vertical', background: '#fff',
              fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ flex: 1, padding: '12px', borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{
              flex: 2, padding: '12px', borderRadius: 11,
              background: isPending ? 'var(--s200)' : 'linear-gradient(135deg, var(--teal), var(--teal-d))',
              color: '#fff', border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: isPending ? 'none' : '0 4px 14px rgba(13,148,136,0.35)',
              transition: 'all 0.2s',
            }}
          >
            {isPending ? <><Spinner size={18} color="#fff" /> Guardando…</> : 'Registrar paciente'}
          </button>
        </div>
      </form>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid var(--s200)',
  padding: '22px 24px',
  marginBottom: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};
