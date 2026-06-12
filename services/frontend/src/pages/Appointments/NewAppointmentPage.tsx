import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Video, Repeat,
  CalendarCheck, CalendarPlus, CheckCircle2, Bell, BellOff,
  UserPlus, RefreshCw, ClipboardList,
  TriangleAlert, Award, Minus, ArrowLeft, User,
  AlertCircle,
} from 'lucide-react';

import { appointmentsApi, Appointment } from '../../api/appointments';
import { patientsApi, Patient } from '../../api/patients';
import { Spinner } from '../../components/ui/Spinner';
import { PatientSearchBox } from '../../components/patients/PatientSearchBox';
import { useAuth } from '../../context/AuthContext';
import { loadSchedule, fetchScheduleFromServer, isWorkingDay, dayLabelOf, type ScheduleConfig } from '../../lib/schedule';
import { useIsCompact } from '../../lib/useMediaQuery';

// ─── Types ────────────────────────────────────────────────────────────────────

type Modality = 'presencial' | 'virtual';
type Recurrence = 'none' | 'weekly' | 'biweekly';

interface SessionType {
  id: string;
  label: string;
  icon: React.ElementType;
  duration: number;
  color: string;
}

const SESSION_TYPES: SessionType[] = [
  { id: 'initial',   label: 'Sesión inicial', icon: UserPlus,  duration: 60, color: '#0d9488' },
  { id: 'followup',  label: 'Seguimiento',    icon: RefreshCw, duration: 50, color: '#0d9488' },
  { id: 'discharge', label: 'Sesión de alta', icon: Award,     duration: 50, color: '#0d9488' },
];

const SLOT_STEP = 30;

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Slots come from the professional's configured working hours,
// excluding the midday break.
function generateSlots(cfg: ScheduleConfig): string[] {
  const start = toMinutes(cfg.startHour);
  const end   = toMinutes(cfg.endHour);
  const brkS  = cfg.breakStart ? toMinutes(cfg.breakStart) : -1;
  const brkE  = cfg.breakEnd   ? toMinutes(cfg.breakEnd)   : -1;
  const slots: string[] = [];
  for (let m = start; m < end; m += SLOT_STEP) {
    if (brkS >= 0 && brkE > brkS && m >= brkS && m < brkE) continue;
    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const min = String(m % 60).padStart(2, '0');
    slots.push(`${h}:${min}`);
  }
  return slots;
}

function formatDateLabel(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(t: string) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function initials(p: Patient) {
  return `${p.first_name[0] ?? ''}${p.paternal_last_name[0] ?? ''}`.toUpperCase();
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function patientFullName(p: Patient) {
  return [p.first_name, p.middle_name, p.paternal_last_name, p.maternal_last_name]
    .filter(Boolean).join(' ');
}

// Always use local calendar date, not UTC (avoids off-by-one after 19:00 in UTC-5)
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "-05:00" for Colombia, derived dynamically so the code works if the tz ever changes
function tzOffset(): string {
  const off = new Date().getTimezoneOffset(); // minutes BEHIND UTC (Colombia = 300)
  const sign = off <= 0 ? '+' : '-';
  const abs  = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Build a timezone-aware ISO string that the backend interprets correctly
function localISO(date: string, time: string): string {
  return `${date}T${time}:00${tzOffset()}`;
}

// ─── MiniCalendar ─────────────────────────────────────────────────────────────

interface MiniCalendarProps {
  selected: string;
  onSelect: (d: string) => void;
  busyDates?: Set<string>;
}

function MiniCalendar({ selected, onSelect, busyDates = new Set() }: MiniCalendarProps) {
  const today = todayISO();
  const [view, setView] = useState<Date>(() => {
    const base = selected ? new Date(selected + 'T00:00:00') : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year  = view.getFullYear();
  const month = view.getMonth();

  const monthLabel = view.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  function toISO(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const prevMonth = () => setView(new Date(year, month - 1, 1));
  const nextMonth = () => setView(new Date(year, month + 1, 1));

  const DOW = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={navBtnStyle}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)', textTransform: 'capitalize' }}>
          {monthLabel}
        </span>
        <button onClick={nextMonth} style={navBtnStyle}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DOW.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--s400)', paddingBottom: 4 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const iso = toISO(day);
          const isPast     = iso < today;
          const isToday    = iso === today;
          const isSelected = iso === selected;
          const hasBusy    = busyDates.has(iso);

          return (
            <div
              key={i}
              onClick={() => !isPast && onSelect(iso)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '4px 0', borderRadius: 6,
                cursor: isPast ? 'not-allowed' : 'pointer',
                background: isSelected ? 'var(--teal)' : 'transparent',
                border: isToday && !isSelected ? '1.5px solid var(--teal)' : '1.5px solid transparent',
                opacity: isPast ? 0.35 : 1,
                transition: 'background 0.15s',
              }}
            >
              <span style={{
                fontSize: 12,
                fontWeight: isSelected || isToday ? 700 : 400,
                color: isSelected ? '#fff' : 'var(--s800)',
              }}>
                {day}
              </span>
              {hasBusy && (
                <span style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--teal)',
                  marginTop: 2,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TimeSlots ────────────────────────────────────────────────────────────────

interface TimeSlotsProps {
  slots: string[];
  selected: string;
  onSelect: (t: string) => void;
  duration: number;
  blocked: Set<string>;
  pastSlots: Set<string>;
}

function TimeSlots({ slots, selected, onSelect, duration, blocked, pastSlots }: TimeSlotsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {slots.map(slot => {
        const slotMin   = toMinutes(slot);
        const isPast    = pastSlots.has(slot);
        const isBlocked = blocked.has(slot);
        const overlaps  = Array.from(blocked).some(b => {
          const bm = toMinutes(b);
          return slotMin >= bm && slotMin < bm + duration;
        });
        const unavail   = isPast || isBlocked || overlaps;
        const isSel     = slot === selected;

        return (
          <button
            key={slot}
            disabled={unavail}
            onClick={() => !unavail && onSelect(slot)}
            title={isPast ? 'Horario pasado' : isBlocked || overlaps ? 'Horario ocupado' : ''}
            style={{
              padding: '7px 4px', borderRadius: 7, cursor: unavail ? 'not-allowed' : 'pointer',
              border: isSel ? 'none' : '1.5px solid var(--s200)',
              background: isSel ? 'var(--teal)' : isPast ? 'transparent' : isBlocked || overlaps ? 'var(--s100)' : '#fff',
              color: isSel ? '#fff' : isPast ? 'var(--s300)' : isBlocked || overlaps ? 'var(--s400)' : 'var(--s700)',
              fontSize: 12, fontFamily: "'DM Mono', monospace",
              fontWeight: isSel ? 700 : 400,
              // past = faded, occupied = strikethrough
              textDecoration: (isBlocked || overlaps) && !isSel && !isPast ? 'line-through' : 'none',
              opacity: isPast ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

interface ModalData {
  patient: Patient | null;
  guestName: string;
  date: string;
  time: string;
  sessionType: SessionType;
  duration: number;
  modality: Modality;
  recurrence: Recurrence;
  reminder: boolean;
  notes: string;
}

interface ConfirmModalProps {
  data: ModalData;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  isSuccess: boolean;
}

function ConfirmModal({ data, onClose, onConfirm, isPending, isSuccess }: ConfirmModalProps) {
  const { patient, guestName, date, time, sessionType, duration, modality, recurrence, reminder } = data;
  const SIcon = sessionType.icon;

  const recurrenceLabel: Record<Recurrence, string> = {
    none: 'Sin recurrencia', weekly: 'Semanal', biweekly: 'Quincenal',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s',
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, width: 480, maxWidth: '95vw',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'scaleIn 0.2s',
        overflow: 'hidden',
      }}>
        {isSuccess ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle2 size={32} color="#fff" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', marginBottom: 8 }}>
              ¡Cita agendada!
            </div>
            <div style={{ fontSize: 14, color: 'var(--s500)' }}>
              La sesión ha sido registrada correctamente.
            </div>
          </div>
        ) : (
          <>
            <div style={{
              background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
              padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ ...avatarStyle, width: 44, height: 44, fontSize: 16, border: '2px solid rgba(255,255,255,0.4)' }}>
                {patient ? initials(patient) : initialsFromName(guestName)}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {patient ? patientFullName(patient) : guestName}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
                  {patient
                    ? `${patient.document_type_code} ${patient.document_number}`
                    : 'Reserva — el paciente se registra en la primera consulta'}
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Fecha',       value: formatDateLabel(date) },
                  { label: 'Hora',        value: formatTime(time) },
                  { label: 'Tipo',        value: sessionType.label },
                  { label: 'Duración',    value: `${duration} min` },
                  { label: 'Modalidad',   value: modality === 'presencial' ? 'Presencial' : 'Virtual' },
                  { label: 'Recurrencia', value: recurrenceLabel[recurrence] },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--s50)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--s400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--s500)', marginBottom: 20 }}>
                <SIcon size={13} color={sessionType.color} />
                <span>{sessionType.label}</span>
                {reminder && (
                  <>
                    <span style={{ color: 'var(--s300)' }}>·</span>
                    <Bell size={13} color="var(--teal)" />
                    <span>Recordatorio activado</span>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} disabled={isPending} style={{ ...secondaryBtn, flex: 1 }}>
                  Cancelar
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isPending}
                  style={{ ...primaryBtn, flex: 1, gap: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {isPending ? <Spinner size={16} color="#fff" /> : <CalendarCheck size={16} />}
                  Confirmar cita
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SummaryPanel ─────────────────────────────────────────────────────────────

interface SummaryPanelProps {
  patient: Patient | null;
  guestName: string;
  date: string;
  time: string;
  sessionType: SessionType | null;
  duration: number;
  modality: Modality;
  recurrence: Recurrence;
  reminder: boolean;
  blockingErrors: string[];
  onSubmit: () => void;
}

function SummaryPanel({ patient, guestName, date, time, sessionType, duration, modality, recurrence, reminder, blockingErrors, onSubmit }: SummaryPanelProps) {
  const SIcon = sessionType?.icon ?? CalendarCheck;
  const hasGuest = guestName.trim().length >= 3;

  const checks = [
    { label: 'Paciente o nombre de reserva', done: !!patient || hasGuest },
    { label: 'Fecha elegida',                done: !!date },
    { label: 'Hora elegida',                 done: !!time },
    { label: 'Tipo de sesión',               done: !!sessionType },
  ];
  const completed = checks.filter(c => c.done).length;
  const progress  = (completed / checks.length) * 100;
  const canSubmit = completed === checks.length && blockingErrors.length === 0;

  const recurrenceLabel: Record<Recurrence, string> = {
    none: 'Sin recurrencia', weekly: 'Semanal', biweekly: 'Quincenal',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1.5px solid #99f6e4', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{
          background: 'var(--teal-d)',
          padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CalendarCheck size={14} color="#fff" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 12.5 }}>Resumen de cita</span>
        </div>

        <div style={{ background: 'var(--teal-l)', padding: 14 }}>
          {patient ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(13,148,136,0.15)' }}>
              <div style={{ ...avatarStyle, width: 38, height: 38, fontSize: 13 }}>{initials(patient)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {patientFullName(patient)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--s500)' }}>{patient.document_type_code} {patient.document_number}</div>
              </div>
            </div>
          ) : hasGuest ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(13,148,136,0.15)' }}>
              <div style={{ ...avatarStyle, width: 38, height: 38, fontSize: 13, background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>{initialsFromName(guestName)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {guestName.trim()}
                </div>
                <div style={{ fontSize: 11, color: '#92400e' }}>Reserva — paciente por registrar</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(13,148,136,0.15)', color: 'var(--s400)', fontSize: 13 }}>
              <User size={15} />
              Sin paciente seleccionado
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { Icon: CalendarCheck, label: date ? formatDateLabel(date) : 'Sin fecha',        ok: !!date },
              { Icon: Clock,         label: time ? formatTime(time) : 'Sin hora',              ok: !!time },
              { Icon: SIcon,         label: sessionType ? `${sessionType.label} · ${duration} min` : 'Sin tipo', ok: !!sessionType },
              { Icon: modality === 'virtual' ? Video : MapPin, label: modality === 'virtual' ? 'Virtual' : 'Presencial', ok: true },
              { Icon: Repeat,        label: recurrenceLabel[recurrence],                       ok: true },
              { Icon: reminder ? Bell : BellOff, label: reminder ? 'Recordatorio activo' : 'Sin recordatorio', ok: true },
            ].map(({ Icon, label, ok }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: ok ? 'rgba(13,148,136,0.12)' : 'var(--s100)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={13} color={ok ? 'var(--teal-d)' : 'var(--s400)'} />
                </div>
                <span style={{ fontSize: 12, color: ok ? 'var(--s700)' : 'var(--s400)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Completado
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-d)' }}>{completed}/{checks.length}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--s200)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: 'linear-gradient(90deg, var(--teal), var(--teal-d))',
            width: `${progress}%`, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {checks.map(({ label, done }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <CheckCircle2 size={12} color={done ? 'var(--teal)' : 'var(--s300)'} />
              <span style={{ color: done ? 'var(--s700)' : 'var(--s400)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Blocking error list */}
      {blockingErrors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {blockingErrors.map(err => (
            <div key={err} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#991b1b' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              {err}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          ...primaryBtn, width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: canSubmit ? 1 : 0.45,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        <CalendarCheck size={16} />
        Agendar cita
      </button>
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} color="#fff" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 12, cursor: 'pointer',
        background: on ? 'var(--teal)' : 'var(--s200)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const avatarStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%',
  background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
  color: '#fff', fontWeight: 700, fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const navBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7, border: '1px solid var(--s200)',
  background: '#fff', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', color: 'var(--s600)',
  transition: 'background 0.15s',
};

const primaryBtn: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
  color: '#fff', fontWeight: 700, fontSize: 14,
  boxShadow: '0 4px 14px rgba(13,148,136,0.35)',
  transition: 'opacity 0.2s, transform 0.1s',
};

const secondaryBtn: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 10,
  border: '1.5px solid var(--s200)', cursor: 'pointer',
  background: '#fff', color: 'var(--s700)', fontWeight: 600, fontSize: 14,
  transition: 'background 0.15s',
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function NewAppointmentPage() {
  const navigate = useNavigate();
  const compact = useIsCompact();
  const [searchParams] = useSearchParams();
  const returnPatientId = searchParams.get('patient_id');
  const { user } = useAuth();

  // Working hours configured in onboarding / Settings → Horario y agenda.
  // Server copy wins (follows the professional across devices); cache covers offline.
  const { data: serverSchedule } = useQuery({
    queryKey: ['my-schedule'],
    queryFn: fetchScheduleFromServer,
    staleTime: 5 * 60_000,
  });
  const cached   = useMemo(() => loadSchedule(), []);
  const schedule = serverSchedule ?? cached;
  const slots    = useMemo(() => generateSlots(schedule), [schedule]);

  // Date preselected in the calendar view (?date=YYYY-MM-DD), if valid and not past
  const initialDate = (() => {
    const d = searchParams.get('date');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayISO() ? d : todayISO();
  })();

  const [patient,     setPatient]     = useState<Patient | null>(null);
  const [guestName,   setGuestName]   = useState<string>('');
  const [date,        setDate]        = useState<string>(initialDate);
  const [time,        setTime]        = useState<string>('');
  const [sessionType, setSessionType] = useState<SessionType | null>(SESSION_TYPES[1]);
  const [duration,    setDuration]    = useState<number>(50);
  const [modality,    setModality]    = useState<Modality>('presencial');
  const [recurrence,  setRecurrence]  = useState<Recurrence>('none');
  const [notes,       setNotes]       = useState<string>('');
  const [reminder,    setReminder]    = useState<boolean>(true);
  const [showModal,   setShowModal]   = useState<boolean>(false);
  const [confirmed,   setConfirmed]   = useState<boolean>(false);

  // Pre-load patient from URL param (e.g. coming from patient profile)
  useEffect(() => {
    if (!returnPatientId || patient) return;
    patientsApi.get(returnPatientId).then(setPatient).catch(() => {});
  }, [returnPatientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Staff appointments for the selected day (slot blocking + workload) ────────
  const { data: dayAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ['appointments-day', date, user?.user_id],
    queryFn: () => appointmentsApi.list({
      staff_id: user?.user_id,
      date_from: localISO(date, '00:00'),
      date_to:   localISO(date, '23:59'),
      limit: 50,
    }),
    enabled: !!date && !!user?.user_id,
  });

  // ── Patient appointments for the selected day (double-booking check) ──────────
  const { data: patientDayAppts = [] } = useQuery<Appointment[]>({
    queryKey: ['patient-day-appts', patient?.id, date],
    queryFn: () => appointmentsApi.list({
      patient_id: patient!.id,
      date_from:  localISO(date, '00:00'),
      date_to:    localISO(date, '23:59'),
      limit: 10,
    }),
    enabled: !!patient?.id && !!date,
  });

  // ── Derived validations ────────────────────────────────────────────────────────
  const isCrisisSession = sessionType?.id === 'crisis';

  // 1. Past slots: today → block slots ≤ now + 30 min buffer
  const pastSlots = useMemo<Set<string>>(() => {
    if (date !== todayISO()) return new Set<string>();
    const now = new Date();
    const cutoffMin = now.getHours() * 60 + now.getMinutes() + 30;
    return new Set(slots.filter(s => toMinutes(s) <= cutoffMin));
  }, [date, slots]);

  // Clear selected time if it becomes past when switching to today
  useEffect(() => {
    if (time && pastSlots.has(time)) setTime('');
  }, [pastSlots, time]);

  // 2. Blocked slots from staff's existing appointments (± configured buffer)
  const blockedSlots = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    const bufferMs = (schedule.buffer ?? 0) * 60_000;
    for (const appt of dayAppointments) {
      if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') continue;
      const start = new Date(new Date(appt.scheduled_at).getTime() - bufferMs);
      const end   = new Date(new Date(appt.scheduled_at).getTime() + appt.duration_min * 60_000 + bufferMs);
      for (const slot of slots) {
        const [h, m] = slot.split(':').map(Number);
        const slotStart = new Date(appt.scheduled_at);
        slotStart.setHours(h, m, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + SLOT_STEP * 60_000);
        if (slotStart < end && slotEnd > start) s.add(slot);
      }
    }
    return s;
  }, [dayAppointments, slots, schedule.buffer]);

  // 3. Busy dates (dot on calendar)
  const busyDates = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    if (dayAppointments.length > 0) s.add(date);
    return s;
  }, [dayAppointments, date]);

  // 4. Same patient already has an appointment this day (double-booking)
  const doubleBookingAppt = patientDayAppts.find(
    a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW'
  );
  const hasDoubleBooking = !!doubleBookingAppt && !isCrisisSession;

  // 5. Patient inactive
  const patientInactive = !!patient && !patient.is_active;

  // 6. Staff workload: ≥ configured max/day → warning; ≥12 → hard block
  const activeApptCount = dayAppointments.filter(
    a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW'
  ).length;
  const workloadWarning = activeApptCount >= (schedule.maxPerDay ?? 8);
  const workloadBlock   = activeApptCount >= 12;

  // 7. Selected date outside configured working days (warning only — exceptions allowed)
  const nonWorkingDay = !!date && !isWorkingDay(date, schedule);

  // Aggregate: can the form be submitted?
  const blockingErrors: string[] = [];
  if (patientInactive)  blockingErrors.push('El paciente está inactivo.');
  if (hasDoubleBooking) blockingErrors.push('El paciente ya tiene una cita este día.');
  if (workloadBlock)    blockingErrors.push('Límite de 12 citas diarias alcanzado.');

  const hasGuest = guestName.trim().length >= 3;

  const mutation = useMutation({
    mutationFn: () => {
      if ((!patient && !hasGuest) || !time || !sessionType) throw new Error('Faltan datos');
      return appointmentsApi.create({
        patient_id:   patient?.id,
        guest_name:   patient ? undefined : guestName.trim(),
        staff_id:     user!.user_id,
        scheduled_at: localISO(date, time),   // timezone-aware: no UTC shift
        duration_min: duration,
        modality:     modality === 'presencial' ? 'IN_PERSON' : 'VIRTUAL',
        notes:        notes || undefined,
      });
    },
    onSuccess: () => {
      setConfirmed(true);
      const dest = returnPatientId ? `/patients/${returnPatientId}` : '/';
      setTimeout(() => navigate(dest), 2000);
    },
  });

  function handleSelectSessionType(st: SessionType) {
    setSessionType(st);
    setDuration(st.duration);
  }

  function handleSubmit() {
    if ((!patient && !hasGuest) || !time || !sessionType) return;
    if (blockingErrors.length > 0) return;
    setShowModal(true);
  }

  const modalData: ModalData | null = (patient || hasGuest) && time && sessionType
    ? { patient, guestName: guestName.trim(), date, time, sessionType, duration, modality, recurrence, reminder, notes }
    : null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? '1fr' : '300px 1fr 272px',
      ...(compact ? { minHeight: 'calc(100vh - var(--topbar-h))' } : { height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden' }),
    }}>
      {/* ── Column 1: Calendar + Patient ──────────────────────────────── */}
      <div style={{
        background: '#fff', borderRight: compact ? 'none' : '1px solid var(--s200)',
        borderBottom: compact ? '1px solid var(--s200)' : 'none',
        padding: compact ? '16px 14px' : '24px 20px', overflowY: compact ? 'visible' : 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <button
          onClick={() => navigate(returnPatientId ? `/patients/${returnPatientId}` : '/')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--s500)', fontSize: 13, marginBottom: 20,
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
          }}
        >
          <ArrowLeft size={15} />
          Volver
        </button>

        <Section icon={CalendarCheck} title="Fecha de cita">
          <MiniCalendar selected={date} onSelect={d => { setDate(d); setTime(''); }} busyDates={busyDates} />
        </Section>

        <Section icon={User} title="Paciente">
          <PatientSearchBox
            selected={patient}
            onSelect={p => { setPatient(p); if (p) setGuestName(''); }}
            onNewPatient={() => navigate('/patients/new')}
          />
          {!patient && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--s200)' }} />
                <span style={{ fontSize: 11, color: 'var(--s400)', fontWeight: 600 }}>o reservar sin registrar</span>
                <div style={{ flex: 1, height: 1, background: 'var(--s200)' }} />
              </div>
              <input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Nombre de quien reserva…"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: `1.5px solid ${hasGuest ? '#f59e0b' : 'var(--s200)'}`,
                  background: hasGuest ? '#fffbeb' : '#fff',
                  fontSize: 14, color: 'var(--s800)', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--s400)', lineHeight: 1.5 }}>
                El paciente se registra y se asocia a la cita en la primera consulta.
              </p>
            </div>
          )}
          {patientInactive && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 8, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#991b1b' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              Paciente inactivo — no se pueden agendar nuevas citas.
            </div>
          )}
        </Section>
      </div>

      {/* ── Column 2: Main form ────────────────────────────────────────── */}
      <div style={{ background: 'var(--s50)', padding: compact ? '20px 14px' : '24px 28px', overflowY: compact ? 'visible' : 'auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: 0 }}>
            Nueva cita
          </h1>
          <p style={{ fontSize: 13, color: 'var(--s500)', margin: '4px 0 0' }}>
            {date ? formatDateLabel(date) : 'Selecciona una fecha'}
          </p>
        </div>

        {/* Workload warning */}
        {workloadWarning && !workloadBlock && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 9, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#92400e' }}>
            <TriangleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Tienes <b>{activeApptCount} citas</b> agendadas para este día. Considera tu capacidad de atención.</span>
          </div>
        )}
        {workloadBlock && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 9, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#991b1b' }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Límite de <b>12 citas diarias</b> alcanzado. No es posible agendar más para este día.</span>
          </div>
        )}

        {/* Double-booking warning */}
        {hasDoubleBooking && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 9, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#991b1b' }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <b>{patient ? `${patient.first_name} ${patient.paternal_last_name}` : 'Este paciente'}</b> ya tiene una cita agendada para este día.
              Para agendar igual, selecciona el tipo <b>Atención en crisis</b>.
            </span>
          </div>
        )}

        {/* Time slots */}
        <Section icon={Clock} title="Hora de inicio">
          <div style={{ fontSize: 12, color: 'var(--s400)', marginBottom: 8 }}>
            Horario de atención: {formatTime(schedule.startHour)} – {formatTime(schedule.endHour)}
            {schedule.breakStart && schedule.breakEnd ? ` · pausa ${formatTime(schedule.breakStart)} – ${formatTime(schedule.breakEnd)}` : ''}
          </div>
          {nonWorkingDay && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 8, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
              <TriangleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              El {dayLabelOf(date)} no está entre tus días de atención configurados. Puedes agendar igual como excepción.
            </div>
          )}
          {date && pastSlots.size === slots.length && (
            <div style={{ fontSize: 12, color: 'var(--s400)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} />
              Todos los horarios del día de hoy ya pasaron.
            </div>
          )}
          {date ? (
            <>
              <TimeSlots
                slots={slots}
                selected={time}
                onSelect={setTime}
                duration={duration}
                blocked={blockedSlots}
                pastSlots={pastSlots}
              />
              {time && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--teal-d)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={12} />
                  {formatTime(time)} — {formatTime((() => {
                    const [h, m] = time.split(':').map(Number);
                    const total = h * 60 + m + duration;
                    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
                  })())}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--s400)', padding: '8px 0' }}>
              Selecciona una fecha para ver los horarios disponibles.
            </div>
          )}
        </Section>

        {/* Session types */}
        <Section icon={CalendarPlus} title="Tipo de sesión">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {SESSION_TYPES.map(st => {
              const SIcon = st.icon;
              const isSel = sessionType?.id === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => handleSelectSessionType(st)}
                  style={{
                    padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                    border: isSel ? `2px solid ${st.color}` : '2px solid var(--s200)',
                    background: isSel ? `${st.color}12` : '#fff',
                    textAlign: 'center', transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <SIcon size={18} color={isSel ? st.color : 'var(--s400)'} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: isSel ? st.color : 'var(--s600)', lineHeight: 1.3 }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--s400)' }}>{st.duration} min</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Modality */}
        <Section icon={MapPin} title="Modalidad">
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              ['presencial', MapPin,  '#0d9488', 'Presencial'],
              ['virtual',    Video,   '#6366f1', 'Virtual'],
            ] as const).map(([val, Icon, color, label]) => {
              const isSel = modality === val;
              return (
                <button
                  key={val}
                  onClick={() => setModality(val)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                    border: isSel ? `2px solid ${color}` : '2px solid var(--s200)',
                    background: isSel ? `${color}12` : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, transition: 'all 0.15s',
                  }}
                >
                  <Icon size={16} color={isSel ? color : 'var(--s400)'} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: isSel ? color : 'var(--s600)' }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Recurrence */}
        <Section icon={Repeat} title="Recurrencia">
          <div style={{ display: 'flex', gap: 8, marginBottom: recurrence !== 'none' ? 12 : 0 }}>
            {([
              ['none',     'Sin repetición', Minus],
              ['weekly',   'Semanal',        Repeat],
              ['biweekly', 'Quincenal',      Repeat],
            ] as const).map(([val, label, Icon]) => {
              const isSel = recurrence === val;
              return (
                <button
                  key={val}
                  onClick={() => setRecurrence(val)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 9, cursor: 'pointer',
                    border: isSel ? '2px solid var(--teal)' : '2px solid var(--s200)',
                    background: isSel ? 'var(--teal-l)' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 6, transition: 'all 0.15s', fontSize: 12, fontWeight: 600,
                    color: isSel ? 'var(--teal-d)' : 'var(--s600)',
                  }}
                >
                  <Icon size={13} />
                  {label}
                </button>
              );
            })}
          </div>
          {recurrence !== 'none' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(13,148,136,0.08)', borderRadius: 8, padding: '10px 12px',
              fontSize: 12, color: 'var(--teal-d)',
            }}>
              <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
              Se creará una cita {recurrence === 'weekly' ? 'cada semana' : 'cada dos semanas'} en el mismo horario. Podrás cancelar en cualquier momento.
            </div>
          )}
        </Section>

        {/* Notes */}
        <Section icon={ClipboardList} title="Notas previas">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Motivo de consulta, notas para preparar la sesión…"
            rows={3}
            style={{
              width: '100%', borderRadius: 10, border: '1.5px solid var(--s200)',
              padding: '10px 14px', fontSize: 13, color: 'var(--s800)',
              resize: 'vertical', fontFamily: 'inherit', background: '#fff',
              outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
            }}
          />
        </Section>

        {/* Reminder */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff', border: '1.5px solid var(--s200)', borderRadius: 10,
          padding: '12px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {reminder ? <Bell size={16} color="var(--teal)" /> : <BellOff size={16} color="var(--s400)" />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>Recordatorio automático</div>
              <div style={{ fontSize: 11, color: 'var(--s500)' }}>Notificación 24h antes de la cita</div>
            </div>
          </div>
          <Toggle on={reminder} onChange={setReminder} />
        </div>
      </div>

      {/* ── Column 3: Summary ─────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderLeft: compact ? 'none' : '1px solid var(--s200)',
        borderTop: compact ? '1px solid var(--s200)' : 'none',
        padding: compact ? '20px 14px' : '24px 18px', overflowY: compact ? 'visible' : 'auto',
      }}>
        <SummaryPanel
          patient={patient}
          guestName={guestName}
          date={date}
          time={time}
          sessionType={sessionType}
          duration={duration}
          modality={modality}
          recurrence={recurrence}
          reminder={reminder}
          blockingErrors={blockingErrors}
          onSubmit={handleSubmit}
        />

        {mutation.isError && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: '#fee2e2', color: '#b91c1c', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={13} />
            Error al agendar la cita. Intenta de nuevo.
          </div>
        )}
      </div>

      {/* ── Confirmation modal ─────────────────────────────────────────── */}
      {showModal && modalData && (
        <ConfirmModal
          data={modalData}
          onClose={() => setShowModal(false)}
          onConfirm={() => mutation.mutate()}
          isPending={mutation.isPending}
          isSuccess={confirmed}
        />
      )}
    </div>
  );
}
