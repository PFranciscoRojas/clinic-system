import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Mail, Phone, MapPin, Video, Check, X, Clock, ChevronDown, ChevronUp, UserPlus } from 'lucide-react';
import { bookingRequestsApi, type BookingRequest, type BookingStatus } from '@/api/bookingRequests';
import { Spinner } from '@/components/ui/Spinner';

const STATUS_CFG: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pendiente',  color: '#92400e', bg: '#fef3c7' },
  CONFIRMED: { label: 'Confirmada', color: '#065f46', bg: '#d1fae5' },
  REJECTED:  { label: 'Rechazada', color: '#991b1b', bg: '#fee2e2' },
  CANCELLED: { label: 'Cancelada', color: '#374151', bg: '#f3f4f6' },
};

const MODALITY_LABEL = { IN_PERSON: 'Presencial', VIRTUAL: 'Virtual' };

const DOC_TYPES = [
  { value: 'CC',  label: 'Cédula de Ciudadanía' },
  { value: 'TI',  label: 'Tarjeta de Identidad' },
  { value: 'CE',  label: 'Cédula de Extranjería' },
  { value: 'PA',  label: 'Pasaporte' },
  { value: 'RC',  label: 'Registro Civil' },
  { value: 'NIT', label: 'NIT' },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Confirm Modal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  req: BookingRequest;
  onClose: () => void;
  onConfirmed: () => void;
}

function ConfirmModal({ req, onClose, onConfirmed }: ConfirmModalProps) {
  const [note, setNote]     = useState('');
  const [docType, setDocType]   = useState('CC');
  const [docNumber, setDocNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender]   = useState('');
  const [error, setError]     = useState('');

  const qc = useQueryClient();
  const confirm = useMutation({
    mutationFn: () => bookingRequestsApi.confirm(req.id, note || undefined, {
      document_type_code: docType || undefined,
      document_number:    docNumber || undefined,
      birth_date:         birthDate || undefined,
      gender:             gender || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-requests'] });
      onConfirmed();
    },
    onError: (e: Error) => setError(e.message || 'Error al confirmar'),
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserPlus size={18} color="#059669" />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--s800)' }}>Confirmar y crear expediente</h2>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--s500)' }}>
            Se creará un paciente y la cita en el sistema.
          </p>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Patient info from booking — read only */}
          <div style={{ background: 'var(--s50)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Datos de la solicitud</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              <Field label="Nombre" value={`${req.first_name} ${req.last_name}`} />
              <Field label="Correo"  value={req.email} />
              {req.phone && <Field label="Teléfono" value={req.phone} />}
              <Field label="Modalidad" value={MODALITY_LABEL[req.modality]} />
              {req.preferred_date && <Field label="Fecha preferida" value={`${req.preferred_date}${req.preferred_time ? ' ' + req.preferred_time : ''}`} />}
            </div>
          </div>

          {/* Document */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Tipo documento</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} style={inputStyle}>
                <option value="">Sin documento</option>
                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.value} — {d.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Número de documento</label>
              <input
                value={docNumber}
                onChange={e => setDocNumber(e.target.value)}
                placeholder="Ej. 1234567890"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Birth date + gender */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Fecha de nacimiento</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Género</label>
              <input value={gender} onChange={e => setGender(e.target.value)} placeholder="Ej. Femenino" style={inputStyle} />
            </div>
          </div>

          {/* Staff note */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Nota interna (opcional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ej. Agendada para el martes 3 a las 10:00"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => confirm.mutate()}
              disabled={confirm.isPending}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', background: '#059669', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: confirm.isPending ? 0.7 : 1 }}
            >
              {confirm.isPending ? <Spinner size={15} color="#fff" /> : <Check size={15} />}
              Confirmar cita
            </button>
            <button
              onClick={onClose}
              disabled={confirm.isPending}
              style={{ padding: '11px 18px', background: '#fff', color: 'var(--s600)', border: '1.5px solid var(--s200)', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box', background: '#fff' };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 11, color: 'var(--s400)', fontWeight: 600 }}>{label}: </span>
      <span style={{ fontSize: 13, color: 'var(--s700)' }}>{value}</span>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function RequestRow({ req }: { req: BookingRequest }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const reject = useMutation({
    mutationFn: () => bookingRequestsApi.reject(req.id, note || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking-requests'] }),
  });

  const cfg = STATUS_CFG[req.status];
  const isPending = req.status === 'PENDING';

  return (
    <>
      {showConfirmModal && (
        <ConfirmModal
          req={req}
          onClose={() => setShowConfirmModal(false)}
          onConfirmed={() => setShowConfirmModal(false)}
        />
      )}

      <div style={{ border: '1px solid var(--s200)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        {/* Summary row */}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', padding: '14px 18px', cursor: 'pointer' }}
          onClick={() => setExpanded(v => !v)}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>
                {req.first_name} {req.last_name}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {req.modality === 'VIRTUAL' ? <Video size={11} /> : <MapPin size={11} />}
                {MODALITY_LABEL[req.modality]}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--s500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Mail size={11} /> {req.email}
              </span>
              {req.phone && (
                <span style={{ fontSize: 12, color: 'var(--s500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={11} /> {req.phone}
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--s400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> {fmtDate(req.created_at)}
              </span>
            </div>
          </div>

          {(req.preferred_date || req.preferred_time) && (
            <div style={{ textAlign: 'center', background: '#f0fdfa', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Calendar size={11} style={{ marginRight: 4 }} />
              {req.preferred_date} {req.preferred_time}
            </div>
          )}

          {expanded ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div style={{ borderTop: '1px solid var(--s100)', padding: '16px 18px', background: 'var(--s50)' }}>
            {req.notes && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--s600)' }}>Mensaje del paciente</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--s700)', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{req.notes}"
                </p>
              </div>
            )}

            {req.staff_note && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid var(--s200)' }}>
                <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: 'var(--s500)' }}>NOTA INTERNA</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--s700)' }}>{req.staff_note}</p>
              </div>
            )}

            {isPending && (
              <div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>
                    Nota para el rechazo (opcional)
                  </label>
                  <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Motivo del rechazo o mensaje al paciente…"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={e => { e.stopPropagation(); setShowConfirmModal(true); }}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                  >
                    <Check size={14} /> Confirmar cita
                  </button>
                  <button
                    onClick={() => reject.mutate()}
                    disabled={reject.isPending}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: reject.isPending ? 0.7 : 1 }}
                  >
                    {reject.isPending ? <Spinner size={14} color="#dc2626" /> : <X size={14} />}
                    No disponible
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BookingRequestsPage() {
  const [filter, setFilter] = useState<BookingStatus | 'ALL'>('PENDING');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['booking-requests', filter],
    queryFn: () => bookingRequestsApi.list(filter === 'ALL' ? undefined : filter),
    refetchInterval: filter === 'PENDING' ? 30_000 : false,
  });

  const tabs: { key: BookingStatus | 'ALL'; label: string }[] = [
    { key: 'PENDING',   label: 'Pendientes' },
    { key: 'CONFIRMED', label: 'Confirmadas' },
    { key: 'REJECTED',  label: 'Rechazadas' },
    { key: 'ALL',       label: 'Todas' },
  ];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--s800)' }}>Solicitudes de cita</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--s500)' }}>
          Pacientes que solicitaron una sesión desde tu página web
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--s100)', borderRadius: 10, padding: 4 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
              background: filter === t.key ? '#fff' : 'transparent',
              color: filter === t.key ? 'var(--s800)' : 'var(--s500)',
              fontWeight: filter === t.key ? 700 : 500,
              fontSize: 13, cursor: 'pointer',
              boxShadow: filter === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >{t.label}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={28} color="var(--teal)" /></div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 14, border: '1px solid var(--s200)' }}>
          <Calendar size={36} color="var(--s200)" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--s400)' }}>
            {filter === 'PENDING' ? 'Sin solicitudes pendientes' : 'Sin solicitudes en esta categoría'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(req => <RequestRow key={req.id} req={req} />)}
        </div>
      )}
    </div>
  );
}
