import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft, User, Phone, Mail, MapPin, AlertCircle,
  CheckCircle2, CreditCard, HeartPulse, Info,
} from 'lucide-react';
import { patientsApi, type CreatePatientBody } from '@/api/patients';
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
}

function Field({ label, value, onChange, placeholder, type = 'text', required, error, hint, icon: Icon, max, min }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

  return (
    <div>
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

  const [docTypeCode, setDocTypeCode] = useState('');
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

  // Per-field errors (set on submit attempt)
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Derived live validations ───────────────────────────────────────────────
  const ageError   = validateAge(birthDate, docTypeCode);
  const phoneError = validatePhone(phone);
  const emailError = validateEmail(email);
  const docNumErr  = validateDocNumber(docNumber, docTypeCode);
  const age        = birthDate ? calcAge(birthDate) : null;

  // Max date for birth_date field: today
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const { mutate: create, isPending, isSuccess } = useMutation({
    mutationFn: (body: CreatePatientBody) => patientsApi.create(body),
    onSuccess: (data) => {
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
    if (!pLastName.trim())     newErrors.pLastName = 'El apellido paterno es requerido.';
    if (ageError)              newErrors.birthDate = ageError;
    if (phoneError)            newErrors.phone     = phoneError;
    if (emailError)            newErrors.email     = emailError;

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    create({
      document_type_code:  docTypeCode,
      document_number:     docNumber.trim(),
      first_name:          firstName.trim(),
      middle_name:         middleName.trim()  || undefined,
      paternal_last_name:  pLastName.trim(),
      maternal_last_name:  mLastName.trim()   || undefined,
      email:               email.trim()       || undefined,
      phone:               phone.trim()       || undefined,
      birth_date:          birthDate          || undefined,
      gender:              gender.trim()      || undefined,
      address:             address.trim()     || undefined,
      notes:               notes.trim()       || undefined,
      emergency_contact_name:  ecName.trim()  || undefined,
      emergency_contact_phone: ecPhone.trim() || undefined,
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
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 40 }}>
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

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: errors.docType ? 'var(--red)' : 'var(--s700)', marginBottom: 8 }}>
              Tipo de documento <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DOCUMENT_TYPES.map(dt => (
                <button
                  key={dt.code}
                  type="button"
                  onClick={() => { setDocTypeCode(dt.code); setErrors(e => ({ ...e, docType: '' })); }}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', transition: 'all .1s',
                    border: `1.5px solid ${docTypeCode === dt.code ? 'var(--teal)' : 'var(--s200)'}`,
                    background: docTypeCode === dt.code ? 'var(--teal-l)' : '#fff',
                    color: docTypeCode === dt.code ? 'var(--teal-d)' : 'var(--s600)',
                    fontWeight: docTypeCode === dt.code ? 700 : 400,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{dt.code}</span>
                  <span style={{ color: 'var(--s500)', marginLeft: 4 }}>— {dt.name}</span>
                </button>
              ))}
            </div>
            {errors.docType && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, color: 'var(--red)' }}>
                <AlertCircle size={11} />{errors.docType}
              </div>
            )}
          </div>

          <Field
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Primer nombre" value={firstName} onChange={v => { setFirstName(v); setErrors(e => ({ ...e, firstName: '' })); }} placeholder="Juan" required error={errors.firstName} />
            <Field label="Segundo nombre" value={middleName} onChange={setMiddleName} placeholder="Carlos (opcional)" />
            <Field label="Apellido paterno" value={pLastName} onChange={v => { setPLastName(v); setErrors(e => ({ ...e, pLastName: '' })); }} placeholder="Pérez" required error={errors.pLastName} />
            <Field label="Apellido materno" value={mLastName} onChange={setMLastName} placeholder="García (opcional)" />
          </div>
        </div>

        {/* ── Datos personales ────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionHeader icon={Phone} title="Contacto y datos personales" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field
              label="Correo electrónico"
              value={email}
              onChange={v => { setEmail(v); setErrors(e => ({ ...e, email: '' })); }}
              icon={Mail}
              type="email"
              placeholder="juan@ejemplo.com"
              error={errors.email}
            />
            <Field
              label="Teléfono"
              value={phone}
              onChange={v => { setPhone(v); setErrors(e => ({ ...e, phone: '' })); }}
              icon={Phone}
              placeholder="3001234567"
              error={errors.phone}
              hint="10 dígitos. Celular empieza en 3."
            />

            {/* Birth date + age preview */}
            <div>
              <Field
                label="Fecha de nacimiento"
                value={birthDate}
                onChange={v => { setBirthDate(v); setErrors(e => ({ ...e, birthDate: '' })); }}
                type="date"
                max={todayStr}
                error={errors.birthDate}
              />
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
        </div>

        {/* ── Contacto de emergencia ──────────────────────────────────────── */}
        <div style={cardStyle}>
          <SectionHeader icon={HeartPulse} title="Contacto de emergencia" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Nombre" value={ecName} onChange={setEcName} placeholder="María García" />
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
