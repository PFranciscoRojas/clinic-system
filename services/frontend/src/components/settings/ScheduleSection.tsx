import React, { useState, useEffect, useMemo } from 'react';
import { Clock, CalendarDays, CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { loadSchedule, persistSchedule, fetchScheduleFromServer } from '@/lib/schedule';
import { FieldRow, FSelect, SectionCard, ChipBtn } from './primitives';

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS   = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

export function ScheduleSection() {
  const queryClient = useQueryClient();
  const init = useMemo(() => loadSchedule(), []);
  const [activeDays,  setActiveDays]  = useState<string[]>(init.activeDays);
  const [startHour,   setStartHour]   = useState(init.startHour);
  const [endHour,     setEndHour]     = useState(init.endHour);
  const [sessionDur,  setSessionDur]  = useState(init.sessionLen);
  const [durInitial,   setDurInitial]   = useState<number | null>(init.sessionLenInitial ?? null);
  const [durFollowup,  setDurFollowup]  = useState<number | null>(init.sessionLenFollowup ?? null);
  const [durDischarge, setDurDischarge] = useState<number | null>(init.sessionLenDischarge ?? null);
  const [breakStart,  setBreakStart]  = useState(init.breakStart ?? '13:00');
  const [breakEnd,    setBreakEnd]    = useState(init.breakEnd ?? '14:00');
  const [buffer,      setBuffer]      = useState(init.buffer ?? 10);
  const [maxPerDay,   setMaxPerDay]   = useState(init.maxPerDay ?? 8);
  const [hydrated,    setHydrated]    = useState(false);

  // Server is the source of truth — hydrate once, then persist every change
  // (localStorage cache + PUT to the profile, so it follows her across devices).
  useEffect(() => {
    fetchScheduleFromServer().then(cfg => {
      if (cfg) {
        setActiveDays(cfg.activeDays);
        setStartHour(cfg.startHour);
        setEndHour(cfg.endHour);
        setSessionDur(cfg.sessionLen);
        setDurInitial(cfg.sessionLenInitial ?? null);
        setDurFollowup(cfg.sessionLenFollowup ?? null);
        setDurDischarge(cfg.sessionLenDischarge ?? null);
        setBreakStart(cfg.breakStart ?? '13:00');
        setBreakEnd(cfg.breakEnd ?? '14:00');
        setBuffer(cfg.buffer ?? 10);
        setMaxPerDay(cfg.maxPerDay ?? 8);
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't overwrite the server copy with stale cache on mount
    const t = setTimeout(() => {
      persistSchedule({
        activeDays, startHour, endHour, sessionLen: sessionDur,
        ...(durInitial   != null ? { sessionLenInitial: durInitial }     : {}),
        ...(durFollowup  != null ? { sessionLenFollowup: durFollowup }   : {}),
        ...(durDischarge != null ? { sessionLenDischarge: durDischarge } : {}),
        breakStart, breakEnd, buffer, maxPerDay,
      })
        // Refresh the scheduler's cached copy so the agenda reflects the new
        // hours without a manual reload.
        .then(() => queryClient.invalidateQueries({ queryKey: ['my-schedule'] }));
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated, activeDays, startHour, endHour, sessionDur, durInitial, durFollowup, durDischarge, breakStart, breakEnd, buffer, maxPerDay, queryClient]);

  const toggleDay = (d: string) => {
    setActiveDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, fontSize: 12.5, color: 'var(--s500)' }}>
        <CheckCircle size={13} color="#10b981" />
        Los cambios se guardan automáticamente en tu perfil y definen los horarios disponibles al agendar citas en cualquier dispositivo.
      </div>
      <SectionCard title="Días de atención" icon={CalendarDays}>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {DAYS_ES.map(d => {
              const on = activeDays.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  style={{ width: 46, height: 46, borderRadius: 10, border: `1.5px solid ${on ? 'var(--teal)' : 'var(--s200)'}`, background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--s500)', fontSize: 13, fontWeight: on ? 700 : 400, transition: 'all .12s', cursor: 'pointer' }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Horario de consulta" icon={Clock}>
        <FieldRow label="Hora de inicio">
          <FSelect value={startHour} onChange={setStartHour}>
            {HOURS.map(h => <option key={h}>{h}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Hora de fin">
          <FSelect value={endHour} onChange={setEndHour}>
            {HOURS.map(h => <option key={h}>{h}</option>)}
          </FSelect>
        </FieldRow>
        <FieldRow label="Duración por defecto de sesión" sub="Se aplica al crear nueva cita salvo que el tipo de sesión tenga su propia duración abajo">
          <div style={{ display: 'flex', gap: 7 }}>
            {[30, 45, 50, 60, 90].map(d => (
              <ChipBtn key={d} active={sessionDur === d} onClick={() => setSessionDur(d)}>
                {d}m
              </ChipBtn>
            ))}
          </div>
        </FieldRow>
        {([
          { label: 'Sesión inicial', value: durInitial,   set: setDurInitial },
          { label: 'Seguimiento',    value: durFollowup,  set: setDurFollowup },
          { label: 'Sesión de alta', value: durDischarge, set: setDurDischarge },
        ] as const).map(({ label, value, set }) => (
          <FieldRow key={label} label={`Duración — ${label}`} sub="Opcional: anula la duración por defecto para este tipo de sesión">
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <ChipBtn active={value === null} onClick={() => set(null)}>
                Por defecto
              </ChipBtn>
              {[30, 45, 50, 60, 90].map(d => (
                <ChipBtn key={d} active={value === d} onClick={() => set(d)}>
                  {d}m
                </ChipBtn>
              ))}
            </div>
          </FieldRow>
        ))}
        <FieldRow label="Pausa del mediodía" sub="No se ofrecen horarios dentro de la pausa">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <FSelect value={breakStart} onChange={setBreakStart}>
              {HOURS.map(h => <option key={h}>{h}</option>)}
            </FSelect>
            <span style={{ color: 'var(--s400)', fontSize: 13, flexShrink: 0 }}>a</span>
            <FSelect value={breakEnd} onChange={setBreakEnd}>
              {HOURS.map(h => <option key={h}>{h}</option>)}
            </FSelect>
          </div>
        </FieldRow>
        <FieldRow label="Buffer entre citas" sub="Tiempo libre mínimo entre sesiones">
          <div style={{ display: 'flex', gap: 7 }}>
            {[0, 5, 10, 15, 20].map(b => (
              <ChipBtn key={b} active={buffer === b} onClick={() => setBuffer(b)}>
                {b}m
              </ChipBtn>
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Máximo de citas por día" sub="Al superarlo, el agendador muestra una alerta de carga">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={1} max={15} value={maxPerDay}
              onChange={e => setMaxPerDay(+e.target.value)}
              style={{ flex: 1, accentColor: 'var(--teal)' } as React.CSSProperties}
            />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: 'var(--teal)', minWidth: 24, textAlign: 'center' }}>{maxPerDay}</span>
          </div>
        </FieldRow>
      </SectionCard>
    </>
  );
}

// ── Notifications section ─────────────────────────────────────────────────────

// A feature that isn't wired yet — shown so the roadmap is visible, but clearly
// marked "Próximamente" and non-interactive so nobody relies on it.
