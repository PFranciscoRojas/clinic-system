import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays,
  Video, MapPin, Clock, User, X, Mic, LayoutGrid, List, Wallet,
  CalendarClock, AlertTriangle,
} from 'lucide-react';
import { appointmentsApi, type Appointment } from '@/api/appointments';
import { patientsApi, type Patient } from '@/api/patients';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import { useIsCompact, useIsMobile } from '@/lib/useMediaQuery';
import { SlotPicker } from '@/components/appointments/SlotPicker';
import { loadSchedule } from '@/lib/schedule';

// ── Constants ────────────────────────────────────────────────────────────────

const HOUR_H    = 64;
const TIME_COL  = 52;
const PX_PER_MIN = HOUR_H / 60;

// The visible day range is derived from the professional's configured schedule
// (Settings → Horario y agenda), then expanded if any appointment falls outside
// it so nothing is ever clipped. Defaults apply when no schedule is set.
const DEFAULT_START_H = 7;
const DEFAULT_END_H   = 20;

// 'HH:MM' → integer hour (0–24). Returns fallback on malformed input.
function hhmmToHour(s: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  if (!m) return fallback;
  return Math.min(24, Math.max(0, parseInt(m[1], 10)));
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DAY_SHORT   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// modality → color/icon
const MC: Record<string, { color: string; bg: string; border: string }> = {
  IN_PERSON: { color: '#14b8a6', bg: '#f0fdfa', border: '#5eead4' },
  VIRTUAL:   { color: '#6366f1', bg: '#eef2ff', border: '#a5b4fc' },
  HYBRID:    { color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tzOffset() {
  const off  = new Date().getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const abs  = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function localISO(date: string, time: string) {
  return `${date}T${time}:00${tzOffset()}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(iso: string): string[] {
  const d   = new Date(iso + 'T12:00:00');
  const dow = d.getDay();
  const off = dow === 0 ? -6 : 1 - dow;
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + off + i);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

// 42-cell grid (6 weeks) starting on the Monday of the week containing the 1st.
function monthGridDays(iso: string): string[] {
  const d = new Date(iso + 'T12:00:00');
  const firstISO = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
  const start = getWeekDays(firstISO)[0];
  return Array.from({ length: 42 }, (_, i) => shiftDate(start, i));
}

function shiftMonth(iso: string, delta: number): string {
  const d  = new Date(iso + 'T12:00:00');
  const nd = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${nd.getFullYear()}-${pad2(nd.getMonth() + 1)}-01`;
}

function monthLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function weekLabel(days: string[]): string {
  const s = new Date(days[0] + 'T12:00:00');
  const e = new Date(days[6] + 'T12:00:00');
  const sm = MONTH_SHORT[s.getMonth()];
  const em = MONTH_SHORT[e.getMonth()];
  return sm === em
    ? `${s.getDate()} – ${e.getDate()} ${sm} ${s.getFullYear()}`
    : `${s.getDate()} ${sm} – ${e.getDate()} ${em} ${e.getFullYear()}`;
}

function localDateOf(isoUTC: string): string {
  const d = new Date(isoUTC);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function endHHMM(appt: Appointment) {
  return new Date(new Date(appt.scheduled_at).getTime() + appt.duration_min * 60_000)
    .toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isInProgress(appt: Appointment) {
  const s = new Date(appt.scheduled_at).getTime();
  const e = s + appt.duration_min * 60_000;
  const n = Date.now();
  return n >= s && n < e && appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED';
}

function isPastAppt(appt: Appointment) {
  return Date.now() >= new Date(appt.scheduled_at).getTime() + appt.duration_min * 60_000;
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function pName(p: Patient) {
  return [p.first_name, p.paternal_last_name].filter(Boolean).join(' ');
}

// ── Per-appt pixel geometry ───────────────────────────────────────────────────

function apptTop(appt: Appointment, startH: number): number {
  const d = new Date(appt.scheduled_at);
  return ((d.getHours() - startH) + d.getMinutes() / 60) * HOUR_H;
}

function apptH(appt: Appointment): number {
  return Math.max(22, (appt.duration_min / 60) * HOUR_H);
}

// ── usePatient ────────────────────────────────────────────────────────────────

function usePatient(id: string) {
  return useQuery<Patient>({
    queryKey: ['patient', id],
    queryFn:  () => patientsApi.get(id),
    enabled:  !!id, // guest reservations have no patient yet
    staleTime: 5 * 60_000,
  });
}

// ── NowIndicator ──────────────────────────────────────────────────────────────

function NowIndicator({ startH, endH }: { startH: number; endH: number }) {
  const calcTop = () => {
    const n = new Date();
    return ((n.getHours() - startH) + n.getMinutes() / 60) * HOUR_H;
  };
  const [top, setTop] = useState(calcTop);

  useEffect(() => {
    setTop(calcTop());
    const id = setInterval(() => setTop(calcTop()), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startH]);

  const h = new Date().getHours();
  if (h < startH || h >= endH) return null;

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, zIndex: 20, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginLeft: -4, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1.5, background: '#ef4444' }} />
    </div>
  );
}

// ── AppBlock ──────────────────────────────────────────────────────────────────

function AppBlock({ appt, onClick, startH, totalH }: { appt: Appointment; onClick: (a: Appointment) => void; startH: number; totalH: number }) {
  const { data: patient } = usePatient(appt.patient_id);
  const mc      = MC[appt.modality] ?? MC.IN_PERSON;
  const inProg  = isInProgress(appt);
  const done    = appt.status === 'COMPLETED';
  const cancel  = appt.status === 'CANCELLED';

  const top = apptTop(appt, startH);
  const h   = apptH(appt);
  if (top < 0 || top >= totalH) return null;

  const clampedH = Math.min(h, totalH - top);
  const bg     = (done || cancel) ? 'var(--s100)' : mc.bg;
  const bdr    = (done || cancel) ? 'var(--s200)' : mc.border;
  const lBdr   = (done || cancel) ? 'var(--s300)' : mc.color;
  const txtClr = (done || cancel) ? 'var(--s400)' : mc.color;
  const nmClr  = (done || cancel) ? 'var(--s500)' : 'var(--s800)';

  const name = patient ? pName(patient) : appt.guest_name || '···';
  const abbr = patient ? initials(pName(patient)) : appt.guest_name ? initials(appt.guest_name) : '?';
  const t0   = fmtHHMM(appt.scheduled_at);
  const t1   = endHHMM(appt);

  const handleEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = `0 4px 14px ${mc.color}30`;
    e.currentTarget.style.transform = 'scale(1.01)';
    e.currentTarget.style.zIndex    = '10';
  };
  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = inProg ? `0 3px 12px ${mc.color}30` : 'none';
    e.currentTarget.style.transform = 'scale(1)';
    e.currentTarget.style.zIndex    = inProg ? '2' : '1';
  };

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(appt); }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        position: 'absolute', left: 3, right: 3, top,
        height: clampedH,
        borderRadius: 8,
        background: bg,
        border: `1.5px solid ${bdr}`,
        borderLeft: `3px solid ${lBdr}`,
        overflow: 'hidden', cursor: 'pointer',
        zIndex: inProg ? 2 : 1,
        opacity: cancel ? 0.6 : 1,
        boxShadow: inProg ? `0 3px 12px ${mc.color}30` : 'none',
        transition: 'box-shadow .15s, transform .12s',
      }}
    >
      {inProg && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: mc.color, animation: 'pulse 2s infinite' }} />
      )}

      {clampedH < 30 ? (
        /* Very compact */
        <div style={{ height: '100%', padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, color: txtClr, flexShrink: 0 }}>{t0}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: nmClr, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none' }}>{name}</span>
        </div>
      ) : clampedH < 46 ? (
        /* Compact */
        <div style={{ height: '100%', padding: '3px 7px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: mc.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: mc.color, flexShrink: 0 }}>{abbr}</div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: nmClr, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none' }}>{name}</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--s400)', flexShrink: 0 }}>{t0}</span>
        </div>
      ) : (
        /* Full */
        <div style={{ padding: '5px 8px', height: '100%', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'nowrap' }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10.5, fontWeight: 700, color: txtClr, whiteSpace: 'nowrap' }}>{t0}–{t1}</span>
            {appt.modality === 'VIRTUAL' ? <Video size={9} color="var(--s400)" /> : <MapPin size={9} color="var(--s400)" />}
            {appt.paid && <Wallet size={9} color="#3e6b4e" />}
            {inProg && <span style={{ fontSize: 9.5, fontWeight: 800, color: mc.color, background: '#fff', borderRadius: 4, padding: '1px 5px', border: `1px solid ${mc.border}`, whiteSpace: 'nowrap' }}>EN CURSO</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: mc.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, color: mc.color, flexShrink: 0 }}>{abbr}</div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: nmClr, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none' }}>{name}</span>
          </div>
          {clampedH >= 54 && (
            <div style={{ fontSize: 11, color: done ? 'var(--s400)' : 'var(--s500)', marginTop: 3 }}>
              {appt.modality === 'IN_PERSON' ? 'Presencial' : appt.modality === 'VIRTUAL' ? 'Virtual' : 'Híbrida'} · {appt.duration_min} min
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({ appt, panelRef, onClose }: { appt: Appointment; panelRef: React.RefObject<HTMLDivElement>; onClose: () => void }) {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { user } = useAuth();
  const { data: patient } = usePatient(appt.patient_id);
  const mc          = MC[appt.modality] ?? MC.IN_PERSON;
  const inProg      = isInProgress(appt);
  const done        = appt.status === 'COMPLETED';
  const isScheduled = appt.status === 'SCHEDULED';

  const [mode, setMode]                   = useState<'none' | 'cancel' | 'reagendar'>('none');
  const [cancelReason, setCancelReason]   = useState('');
  const [cancelling,   setCancelling]     = useState(false);
  const [reagendaring, setReagendaring]   = useState(false);
  const [actionErr,    setActionErr]      = useState('');

  const name    = patient ? pName(patient) : appt.guest_name || `Paciente #${appt.patient_id.slice(-4)}`;
  const abbr    = patient ? initials(pName(patient)) : '?';
  const t0      = fmtHHMM(appt.scheduled_at);
  const t1      = endHHMM(appt);
  const dateStr = new Date(appt.scheduled_at).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  let statusLabel = 'Confirmada', statusColor = '#3b82f6', statusBg = '#eff6ff';
  if (done)                        { statusLabel = 'Completada'; statusColor = '#10b981'; statusBg = '#ecfdf5'; }
  if (inProg)                      { statusLabel = 'En curso';   statusColor = mc.color;  statusBg = mc.bg; }
  if (isPastAppt(appt) && !done)   { statusLabel = 'Pendiente';  statusColor = '#f59e0b'; statusBg = '#fffbeb'; }
  if (appt.status === 'CANCELLED') { statusLabel = 'Cancelada';  statusColor = '#ef4444'; statusBg = '#fee2e2'; }

  const tzOff = () => {
    const off = new Date().getTimezoneOffset();
    const sign = off <= 0 ? '+' : '-'; const abs = Math.abs(off);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setCancelling(true); setActionErr('');
    try {
      await appointmentsApi.cancel(appt.id, cancelReason.trim());
      qc.invalidateQueries({ queryKey: ['cal-range'] });
      onClose();
    } catch {
      setActionErr('No se pudo cancelar. Intenta de nuevo.');
    } finally {
      setCancelling(false);
    }
  };

  const handleReagendar = async (date: string, time: string) => {
    setReagendaring(true); setActionErr('');
    try {
      await appointmentsApi.create({
        patient_id:   appt.patient_id || undefined,
        guest_name:   !appt.patient_id ? (appt.guest_name ?? undefined) : undefined,
        staff_id:     user!.user_id,
        scheduled_at: `${date}T${time}:00${tzOff()}`,
        duration_min: appt.duration_min,
        modality:     appt.modality,
      });
      await appointmentsApi.cancel(appt.id, 'Reagendado');
      qc.invalidateQueries({ queryKey: ['cal-range'] });
      onClose();
    } catch {
      setActionErr('No se pudo reagendar. Intenta de nuevo.');
      setReagendaring(false);
    }
  };

  return (
    <div ref={panelRef} className="anim-scale-in" style={{
      position: 'absolute', top: 12, right: 12, width: 300, maxWidth: 'calc(100vw - 24px)', zIndex: 50,
      background: '#fff', borderRadius: 16,
      border: '1px solid var(--s200)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
      overflow: 'hidden',
    }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${mc.color}, ${mc.color}88)` }} />

      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--s100)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: mc.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: mc.color, flexShrink: 0 }}>{abbr}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--s500)', marginTop: 1 }}>{appt.duration_min} min</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', flexShrink: 0, display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
      </div>

      {/* Badges */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--s100)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: mc.color, background: mc.bg, borderRadius: 6, padding: '3px 8px', border: `1px solid ${mc.border}` }}>
          {appt.modality === 'IN_PERSON' ? 'Presencial' : appt.modality === 'VIRTUAL' ? 'Virtual' : 'Híbrida'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, background: statusBg, borderRadius: 6, padding: '3px 8px' }}>{statusLabel}</span>
      </div>

      {/* Details */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--s100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <CalendarDays size={13} color="var(--s400)" />
          <span style={{ fontSize: 13, color: 'var(--s600)', textTransform: 'capitalize' }}>{dateStr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={13} color="var(--s400)" />
          <span style={{ fontSize: 13, color: 'var(--s600)' }}>{t0} – {t1} ({appt.duration_min} min)</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => navigate(`/appointments/${appt.id}`)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, border: 'none', borderRadius: 9, cursor: 'pointer', background: `linear-gradient(135deg, ${mc.color}, ${mc.border})`, color: '#fff', fontWeight: 700, fontSize: 13, boxShadow: `0 3px 12px ${mc.color}44` }}
        >
          {appt.modality === 'VIRTUAL' ? <Video size={14} /> : <Mic size={14} />}
          Abrir cita
        </button>
        {appt.patient_id && (
          <button
            onClick={() => navigate(`/patients/${appt.patient_id}`)}
            style={{ padding: 8, border: '1.5px solid var(--s200)', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 12.5, color: 'var(--s600)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all .12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = mc.color; e.currentTarget.style.color = mc.color; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.color = 'var(--s600)'; }}
          >
            <User size={13} /> Ver perfil del paciente
          </button>
        )}

        {/* Cancel + Reagendar — only for SCHEDULED appointments */}
        {isScheduled && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setMode(m => m === 'cancel' ? 'none' : 'cancel'); setActionErr(''); }}
              style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #fca5a5', borderRadius: 9, background: mode === 'cancel' ? '#fee2e2' : '#fff', cursor: 'pointer', fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontWeight: 600 }}
            >
              <X size={12} /> Cancelar
            </button>
            <button
              onClick={() => { setMode(m => m === 'reagendar' ? 'none' : 'reagendar'); setActionErr(''); }}
              style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #c7d2fe', borderRadius: 9, background: mode === 'reagendar' ? '#eef2ff' : '#fff', cursor: 'pointer', fontSize: 12, color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontWeight: 600 }}
            >
              <CalendarClock size={12} /> Reagendar
            </button>
          </div>
        )}

        {/* Cancel form */}
        {mode === 'cancel' && (
          <div>
            <input
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Motivo de cancelación…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 12.5, boxSizing: 'border-box', marginBottom: 6 }}
            />
            <button
              onClick={handleCancel}
              disabled={!cancelReason.trim() || cancelling}
              style={{ width: '100%', padding: '8px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: !cancelReason.trim() ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: !cancelReason.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {cancelling ? <Spinner size={13} color="#fff" /> : null} Confirmar cancelación
            </button>
          </div>
        )}

        {mode === 'reagendar' && (
          <SlotPicker
            modality={appt.modality}
            onConfirm={handleReagendar}
            onClose={() => { setMode('none'); setActionErr(''); }}
            confirming={reagendaring}
            error={actionErr}
          />
        )}

        {actionErr && (
          <p style={{ margin: 0, fontSize: 11.5, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={11} /> {actionErr}
          </p>
        )}
      </div>
    </div>
  );
}

// ── MiniCalendar ──────────────────────────────────────────────────────────────

function MiniCalendar({ selected, weekDays, apptDates, onSelect }: {
  selected:   string;
  weekDays:   string[];
  apptDates:  Set<string>;
  onSelect:   (iso: string) => void;
}) {
  const today = todayISO();
  const initD = new Date(selected + 'T12:00:00');
  const [year,  setYear]  = useState(initD.getFullYear());
  const [month, setMonth] = useState(initD.getMonth());

  function prev() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const cells = useMemo(() => {
    const first = new Date(year, month, 1).getDay(); // 0=Sun
    const days  = new Date(year, month + 1, 0).getDate();
    const off   = first === 0 ? 6 : first - 1;
    const result: (string | null)[] = Array(off).fill(null);
    for (let d = 1; d <= days; d++) {
      result.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  return (
    <div style={{ padding: '16px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prev} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 4, display: 'flex' }}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>{MONTH_NAMES[month]} {year}</span>
        <button onClick={next} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 4, display: 'flex' }}><ChevronRight size={14} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, marginBottom: 4 }}>
        {['L','M','M','J','V','S','D'].map((d, i) => (
          <div key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--s400)', textAlign: 'center' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1 }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const isT   = iso === today;
          const isSel = iso === selected;
          const inW   = weekDays.includes(iso);
          const hasDot = apptDates.has(iso);
          return (
            <button
              key={iso}
              onClick={() => onSelect(iso)}
              style={{
                width: '100%', aspectRatio: '1', border: 'none', cursor: 'pointer',
                borderRadius: 99, fontSize: 11.5, position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: isT ? 'var(--teal)' : inW ? 'rgba(20,184,166,.10)' : 'transparent',
                color: isT ? '#fff' : isSel ? 'var(--teal)' : inW ? 'var(--teal-d)' : 'var(--s700)',
                fontWeight: (isT || isSel) ? 700 : 400,
                outline: isSel && !isT ? '2px solid var(--teal)' : 'none',
                outlineOffset: -2,
              }}
            >
              {new Date(iso + 'T12:00:00').getDate()}
              {hasDot && !isT && (
                <div style={{ position: 'absolute', bottom: 2, width: 3, height: 3, borderRadius: '50%', background: 'var(--teal)' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── ProximaItem ───────────────────────────────────────────────────────────────

function ProximaItem({ appt }: { appt: Appointment }) {
  const { data: patient } = usePatient(appt.patient_id);
  const mc     = MC[appt.modality] ?? MC.IN_PERSON;
  const inProg = isInProgress(appt);
  const name   = patient ? pName(patient) : appt.guest_name || '···';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--s200)', marginBottom: 5, background: inProg ? mc.bg : '#fff' }}>
      <div style={{ width: 3, height: 32, borderRadius: 99, background: mc.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--s800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11.5, fontWeight: 700, color: 'var(--s600)' }}>{fmtHHMM(appt.scheduled_at)}</span>
          {inProg && <span style={{ fontSize: 10, fontWeight: 700, color: mc.color, background: mc.bg, borderRadius: 4, padding: '1px 5px' }}>EN CURSO</span>}
        </div>
      </div>
    </div>
  );
}

// ── DaySummary ────────────────────────────────────────────────────────────────

function DaySummary({ appts, selected }: { appts: Appointment[]; selected: string }) {
  const dayAppts = useMemo(() =>
    appts
      .filter(a => localDateOf(a.scheduled_at) === selected && a.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [appts, selected]
  );

  const done    = dayAppts.filter(a => a.status === 'COMPLETED').length;
  const pending = dayAppts.filter(a => a.status !== 'COMPLETED').length;
  const next4   = dayAppts.filter(a => a.status !== 'COMPLETED').slice(0, 4);
  const dateLabel = new Date(selected + 'T12:00:00')
    .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--s100)' }}>
      <div style={{ paddingTop: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--s400)', marginBottom: 8, textTransform: 'capitalize' as const }}>
          {dateLabel}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, padding: '8px 10px', borderRadius: 9, background: '#ecfdf5' }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: '#10b981' }}>{done}</div>
            <div style={{ fontSize: 10.5, color: 'var(--s500)', marginTop: 2 }}>Hechas</div>
          </div>
          <div style={{ flex: 1, padding: '8px 10px', borderRadius: 9, background: '#fffbeb' }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: '#f59e0b' }}>{pending}</div>
            <div style={{ fontSize: 10.5, color: 'var(--s500)', marginTop: 2 }}>Pendientes</div>
          </div>
        </div>
      </div>
      {next4.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--s400)', marginBottom: 6 }}>Próximas</div>
          {next4.map(a => <ProximaItem key={a.id} appt={a} />)}
        </>
      )}
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthApptChip({ appt, onClick }: { appt: Appointment; onClick: (a: Appointment) => void }) {
  const { data: patient } = usePatient(appt.patient_id);
  const mc   = MC[appt.modality] ?? MC.IN_PERSON;
  const done = appt.status === 'COMPLETED';
  const cancelled = appt.status === 'CANCELLED';
  const name = patient ? pName(patient) : appt.guest_name || '···';

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(appt); }}
      title={`${fmtHHMM(appt.scheduled_at)} · ${name}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%',
        border: 'none', borderRadius: 5, padding: '2px 6px', marginBottom: 2,
        background: cancelled ? 'var(--s100)' : mc.bg, cursor: 'pointer', textAlign: 'left',
        opacity: done || cancelled ? 0.6 : 1,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cancelled ? 'var(--s400)' : mc.color, flexShrink: 0 }} />
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, color: 'var(--s600)', flexShrink: 0 }}>
        {fmtHHMM(appt.scheduled_at)}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--s700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done || cancelled ? 'line-through' : 'none' }}>
        {name}
      </span>
    </button>
  );
}

const MONTH_DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function MonthGrid({ days, byDay, selected, today, onDayClick, onApptClick, compact }: {
  days: string[];
  byDay: Record<string, Appointment[]>;
  selected: string;
  today: string;
  onDayClick: (d: string) => void;
  onApptClick: (a: Appointment) => void;
  compact?: boolean;
}) {
  const currentMonth = new Date(selected + 'T12:00:00').getMonth();
  const MAX_CHIPS = compact ? 2 : 3;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: compact ? 0 : 660 }}>
      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--s200)', flexShrink: 0 }}>
        {MONTH_DOW.map(d => (
          <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* 6-week grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', overflow: 'auto' }}>
        {days.map(day => {
          const d        = new Date(day + 'T12:00:00');
          const inMonth  = d.getMonth() === currentMonth;
          const isT      = day === today;
          const dayAppts = (byDay[day] ?? []).slice().sort((a, b) =>
            new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
          const extra    = dayAppts.length - MAX_CHIPS;

          return (
            <div
              key={day}
              onClick={() => onDayClick(day)}
              style={{
                borderRight: '1px solid var(--s100)', borderBottom: '1px solid var(--s100)',
                padding: compact ? '2px 3px' : '4px 5px', cursor: 'pointer', minHeight: compact ? 64 : 84, overflow: 'hidden',
                background: isT ? 'rgba(20,184,166,.05)' : inMonth ? '#fff' : 'var(--s50)',
                transition: 'background .12s',
              }}
              onMouseEnter={e => { if (!isT) e.currentTarget.style.background = 'var(--teal-l)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isT ? 'rgba(20,184,166,.05)' : inMonth ? '#fff' : 'var(--s50)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: isT ? 800 : 600,
                  background: isT ? 'var(--teal)' : 'transparent',
                  color: isT ? '#fff' : inMonth ? 'var(--s700)' : 'var(--s300)',
                }}>
                  {d.getDate()}
                </span>
              </div>
              {dayAppts.slice(0, MAX_CHIPS).map(a => (
                <MonthApptChip key={a.id} appt={a} onClick={onApptClick} />
              ))}
              {extra > 0 && (
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--teal-d)', paddingLeft: 6 }}>
                  +{extra} más
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AgendaCalendar (main export) ──────────────────────────────────────────────

export type CalView = 'month' | 'week' | 'day';

export function AgendaCalendar({ initialDate }: { initialDate?: string }) {
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const compact      = useIsCompact();
  const isMobile     = useIsMobile();
  const [selected, setSelectedRaw]    = useState(() => sessionStorage.getItem('sghcp_cal_date') || initialDate || todayISO());
  const setSelected = (v: string | ((prev: string) => string)) => {
    setSelectedRaw(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      sessionStorage.setItem('sghcp_cal_date', next);
      return next;
    });
  };
  const [calView, setCalView]         = useState<CalView>(() => {
    const saved = localStorage.getItem('sghcp_cal_view');
    return saved === 'month' || saved === 'week' || saved === 'day' ? saved : 'week';
  });
  const changeView = (v: CalView) => { setCalView(v); localStorage.setItem('sghcp_cal_view', v); };
  const [selAppt, setSelAppt]         = useState<Appointment | null>(null);
  const [quickSlot, setQuickSlot]     = useState<{ day: string; time: string; top: number } | null>(null);
  const gridRef   = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const today     = todayISO();
  const weekDays  = useMemo(() => getWeekDays(selected), [selected]);
  const monthDays = useMemo(() => monthGridDays(selected), [selected]);
  const rangeDays = calView === 'month' ? monthDays : weekDays;

  // ── Query: visible range (week or month grid) ────────────────────────────
  const { data: appts = [], isLoading } = useQuery({
    queryKey: ['cal-range', rangeDays[0], rangeDays[rangeDays.length - 1], user?.user_id],
    queryFn:  () => appointmentsApi.list({
      staff_id:  user?.user_id,
      date_from: localISO(rangeDays[0], '00:00'),
      date_to:   localISO(rangeDays[rangeDays.length - 1], '23:59'),
      limit:     100,
    }),
    enabled:        !!user,
    refetchInterval: 60_000,
  });

  // Group by local date
  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const d of rangeDays) map[d] = [];
    for (const a of appts) {
      if (a.status === 'CANCELLED') continue;
      const ld = localDateOf(a.scheduled_at);
      if (map[ld]) map[ld].push(a);
    }
    return map;
  }, [appts, rangeDays]);

  const apptDates = useMemo(() => new Set(appts.map(a => localDateOf(a.scheduled_at))), [appts]);
  const viewDays  = calView === 'week' ? weekDays : [selected];

  // ── Visible day range: configured schedule, expanded to fit any appointment ──
  const schedule = useMemo(() => loadSchedule(), []);
  const { startH, endH } = useMemo(() => {
    let s = hhmmToHour(schedule.startHour, DEFAULT_START_H);
    let e = hhmmToHour(schedule.endHour, DEFAULT_END_H);
    if (e <= s) e = Math.min(24, s + 1);
    for (const a of appts) {
      const d = new Date(a.scheduled_at);
      s = Math.min(s, d.getHours());
      const endMins = d.getHours() * 60 + d.getMinutes() + a.duration_min;
      e = Math.max(e, Math.ceil(endMins / 60));
    }
    s = Math.max(0, Math.min(s, 23));
    e = Math.min(24, Math.max(e, s + 1));
    return { startH: s, endH: e };
  }, [schedule, appts]);
  const hours  = useMemo(() => Array.from({ length: endH - startH }, (_, i) => startH + i), [startH, endH]);
  const totalH = (endH - startH) * HOUR_H;

  // Dismiss the quick-booking popover when the day/week or view changes.
  useEffect(() => { setQuickSlot(null); }, [selected, calView]);

  // Scroll to current time on first render and view change
  useEffect(() => {
    if (!gridRef.current) return;
    const n    = new Date();
    const mins = (n.getHours() - startH) * 60 + n.getMinutes();
    gridRef.current.scrollTop = Math.max(0, mins * PX_PER_MIN - 120);
  }, [calView, startH]);

  // Close detail on outside click
  useEffect(() => {
    if (!selAppt) return;
    const handle = (e: MouseEvent) => {
      if (detailRef.current && !detailRef.current.contains(e.target as Node)) setSelAppt(null);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [selAppt]);

  const step = calView === 'week' ? 7 : 1; // month handled separately
  const hasInProgress = appts.some(a => isInProgress(a));

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#fff' }}>

      {/* ── Left panel (hidden on tablet/phone — the toolbar covers navigation) */}
      {!compact && (
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--s200)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <MiniCalendar
          selected={selected}
          weekDays={weekDays}
          apptDates={apptDates}
          onSelect={d => { setSelected(d); changeView('day'); }}
        />
        <DaySummary appts={appts} selected={selected} />
      </div>
      )}

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ minHeight: 56, flexShrink: 0, background: '#fff', borderBottom: '1px solid var(--s200)', display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, padding: isMobile ? '8px 10px' : '0 18px', flexWrap: 'wrap' }}>

          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={() => setSelected(d => calView === 'month' ? shiftMonth(d, -1) : shiftDate(d, -step))}
              style={{ border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'flex' }}
            ><ChevronLeft size={14} /></button>
            <span style={{ fontWeight: 700, fontSize: isMobile ? 12.5 : 14, color: 'var(--s800)', whiteSpace: 'nowrap', padding: '0 4px', minWidth: isMobile ? 0 : 200, textAlign: 'center', textTransform: 'capitalize' }}>
              {calView === 'month'
                ? monthLabel(selected)
                : calView === 'week'
                ? weekLabel(weekDays)
                : new Date(selected + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              }
            </span>
            <button
              onClick={() => setSelected(d => calView === 'month' ? shiftMonth(d, 1) : shiftDate(d, step))}
              style={{ border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', display: 'flex' }}
            ><ChevronRight size={14} /></button>
          </div>

          {/* Hoy */}
          <button
            onClick={() => setSelected(todayISO())}
            style={{ padding: '5px 12px', border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--s600)', cursor: 'pointer', transition: 'all .12s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--teal)'; e.currentTarget.style.borderColor = 'var(--teal)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--s600)'; e.currentTarget.style.borderColor = 'var(--s200)'; }}
          >Hoy</button>

          {/* En curso badge */}
          {hasInProgress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdfa', border: '1px solid #5eead4', borderRadius: 8, padding: '5px 10px' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-d)' }}>En curso</span>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--s100)', borderRadius: 9, padding: 3, gap: 2 }}>
            {([
              { key: 'month' as CalView, icon: CalendarDays, label: 'Mes'    },
              { key: 'week'  as CalView, icon: LayoutGrid,   label: 'Semana' },
              { key: 'day'   as CalView, icon: List,          label: 'Día'    },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => changeView(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', border: 'none', cursor: 'pointer', borderRadius: 7,
                  fontSize: 12.5, fontWeight: calView === key ? 700 : 400,
                  background: calView === key ? '#fff' : 'transparent',
                  color: calView === key ? 'var(--s800)' : 'var(--s500)',
                  boxShadow: calView === key ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                  transition: 'all .15s',
                }}
              >
                <Icon size={13} color={calView === key ? 'var(--teal)' : 'var(--s400)'} />
                {label}
              </button>
            ))}
          </div>

          {/* Nueva cita */}
          <button
            onClick={() => navigate(`/appointments/new?date=${selected}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13.5, fontWeight: 700, boxShadow: '0 2px 8px rgba(20,184,166,.35)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
          >
            <Plus size={15} color="white" /> {isMobile ? 'Cita' : 'Nueva cita'}
          </button>
        </div>

        {/* ── Grid wrapper ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

          {isLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.8)', zIndex: 30 }}>
              <Spinner size={28} color="var(--teal)" />
            </div>
          )}

          {/* Month grid */}
          {calView === 'month' && (
            <MonthGrid
              days={monthDays}
              byDay={byDay}
              selected={selected}
              today={today}
              compact={isMobile}
              onDayClick={d => { setSelected(d); changeView('day'); }}
              onApptClick={setSelAppt}
            />
          )}

          {/* Scrollable content (week / day) */}
          {calView !== 'month' && (
          <div ref={gridRef} style={{ height: '100%', overflow: 'auto' }}>
            <div style={{ display: 'flex', minWidth: calView === 'week' ? 660 : 360 }}>

              {/* Time column */}
              <div style={{ width: TIME_COL, flexShrink: 0, paddingTop: 48 }}>
                {hours.map(h => (
                  <div key={h} style={{ height: HOUR_H, display: 'flex', alignItems: 'flex-start', paddingTop: 5, paddingRight: 8, justifyContent: 'flex-end' }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 500, color: 'var(--s300)' }}>
                      {String(h).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${viewDays.length}, 1fr)` }}>
                {viewDays.map(day => {
                  const isT  = day === today;
                  const dayAppts = byDay[day] ?? [];

                  return (
                    <div key={day} style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--s200)' }}>
                      {/* Sticky header */}
                      <div style={{
                        height: 48, position: 'sticky', top: 0, zIndex: 10,
                        background: isT ? 'var(--teal-l)' : '#fff',
                        borderBottom: `1px solid ${isT ? 'var(--teal)' : 'var(--s200)'}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: isT ? 'var(--teal-d)' : 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                          {DAY_SHORT[new Date(day + 'T12:00:00').getDay()]}
                        </span>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', marginTop: 2, background: isT ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: isT ? '#fff' : 'var(--s700)' }}>
                            {new Date(day + 'T12:00:00').getDate()}
                          </span>
                        </div>
                      </div>

                      {/* Slot area — clicking an empty spot offers a quick booking */}
                      <div
                        style={{ position: 'relative', height: totalH, background: isT ? 'rgba(20,184,166,.015)' : 'transparent', cursor: 'pointer' }}
                        onClick={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const y = e.clientY - rect.top;
                          let mins = startH * 60 + y / PX_PER_MIN;
                          mins = Math.round(mins / 15) * 15;
                          mins = Math.max(startH * 60, Math.min(mins, endH * 60 - 15));
                          const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
                          setQuickSlot({ day, time, top: (mins - startH * 60) * PX_PER_MIN });
                        }}
                      >
                        {hours.map(h => (
                          <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - startH) * HOUR_H, borderTop: '1px solid var(--s100)' }} />
                        ))}
                        {hours.map(h => (
                          <div key={`hh${h}`} style={{ position: 'absolute', left: 0, right: 0, top: (h - startH) * HOUR_H + HOUR_H / 2, borderTop: '1px dashed var(--s100)' }} />
                        ))}
                        {isT && <NowIndicator startH={startH} endH={endH} />}
                        {dayAppts.map(a => <AppBlock key={a.id} appt={a} onClick={x => { setSelAppt(x); setQuickSlot(null); }} startH={startH} totalH={totalH} />)}
                        {quickSlot?.day === day && (
                          <div
                            onClick={e => e.stopPropagation()}
                            style={{
                              position: 'absolute', top: Math.max(0, quickSlot.top - 4), left: 4, right: 4, zIndex: 25,
                              background: '#fff', border: '1.5px solid var(--teal)', borderRadius: 10,
                              boxShadow: '0 6px 24px rgba(15,23,42,.16)', padding: '8px 10px',
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}
                          >
                            <Clock size={14} color="var(--teal)" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--s800)' }}>Agendar a las {quickSlot.time}</div>
                              <div style={{ fontSize: 11, color: 'var(--s400)' }}>{new Date(day + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                            </div>
                            <button
                              onClick={() => navigate(`/appointments/new?date=${day}&time=${quickSlot.time}`)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            ><Plus size={13} color="white" /> Agendar</button>
                            <button
                              onClick={() => setQuickSlot(null)}
                              aria-label="Cerrar"
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 2, flexShrink: 0 }}
                            ><X size={15} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* Detail panel */}
          {selAppt && (
            <DetailPanel
              appt={selAppt}
              panelRef={detailRef}
              onClose={() => setSelAppt(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
