import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, X } from 'lucide-react';
import { appointmentsApi } from '@/api/appointments';
import { Spinner } from '@/components/ui/Spinner';

interface SlotPickerProps {
  modality: string;
  onConfirm: (date: string, time: string) => void;
  onClose: () => void;
  confirming?: boolean;
  error?: string;
}

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SlotPicker({ modality, onConfirm, onClose, confirming, error }: SlotPickerProps) {
  const today = todayISO();
  const to = addDays(today, 30);

  const { data, isLoading } = useQuery({
    queryKey: ['slot-availability', today, to, modality],
    queryFn: () => appointmentsApi.availability(today, to, modality),
    staleTime: 2 * 60_000,
  });

  const days = data?.days ?? [];
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  const slots = days.find(d => d.date === selectedDate)?.slots ?? [];

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedTime('');
  };

  return (
    <div style={{ marginTop: 14, background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#e0e7ff', borderBottom: '1px solid #c7d2fe' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#312e81' }}>
          <CalendarDays size={14} /> Elige una franja disponible
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex' }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', justifyContent: 'center' }}>
            <Spinner size={18} color="#6366f1" />
            <span style={{ fontSize: 13, color: '#4338ca' }}>Cargando horarios disponibles…</span>
          </div>
        ) : days.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#6366f1', textAlign: 'center', padding: '10px 0' }}>
            No hay franjas disponibles en los próximos 30 días.
          </p>
        ) : (
          <>
            {/* Day selector */}
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '.06em' }}>Fecha</p>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
              {days.map(d => {
                const dt = new Date(d.date + 'T12:00:00');
                const isSel = selectedDate === d.date;
                return (
                  <button
                    key={d.date}
                    onClick={() => handleSelectDate(d.date)}
                    style={{
                      flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '7px 12px', borderRadius: 9,
                      border: `1.5px solid ${isSel ? '#6366f1' : '#c7d2fe'}`,
                      background: isSel ? '#6366f1' : '#fff',
                      color: isSel ? '#fff' : '#4338ca',
                      cursor: 'pointer', transition: 'all .12s',
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>{DAY_SHORT[dt.getDay()]}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{dt.getDate()}</span>
                    <span style={{ fontSize: 9, opacity: 0.75 }}>{MONTH_SHORT[dt.getMonth()]}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, marginTop: 2, background: isSel ? 'rgba(255,255,255,.25)' : '#eef2ff', borderRadius: 4, padding: '1px 4px' }}>
                      {d.slots.length} sl
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Slot grid */}
            {selectedDate && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} /> Hora
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {slots.map(time => {
                    const isSel = selectedTime === time;
                    return (
                      <button
                        key={time}
                        onClick={() => setSelectedTime(time)}
                        style={{
                          padding: '7px 14px', borderRadius: 7,
                          border: `1.5px solid ${isSel ? '#6366f1' : '#c7d2fe'}`,
                          background: isSel ? '#6366f1' : '#fff',
                          color: isSel ? '#fff' : '#4338ca',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'DM Mono', monospace",
                          transition: 'all .1s',
                        }}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Confirm */}
            {selectedDate && selectedTime && (
              <button
                onClick={() => onConfirm(selectedDate, selectedTime)}
                disabled={!!confirming}
                style={{
                  width: '100%', padding: '10px 0', background: '#6366f1', color: '#fff',
                  border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700,
                  cursor: confirming ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {confirming ? <Spinner size={13} color="#fff" /> : <CalendarDays size={13} />}
                Confirmar — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })} a las {selectedTime}
              </button>
            )}

            {error && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
