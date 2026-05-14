import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList, LayoutGrid, Clock, UserRound, ArrowLeft,
  HeartCrack, Zap, Layers, ShieldAlert, Star, Thermometer,
  List, Info, Check, Play, Save, CheckCircle, ListChecks,
  RefreshCw, FileText, Download, TrendingUp, TrendingDown,
  Wrench,
} from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { Spinner } from '@/components/ui/Spinner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Band {
  min:    number;
  max:    number;
  label:  string;
  color:  string;
  action: string;
}

interface Instrument {
  id:           string;
  code:         string;
  name:         string;
  category:     string;
  Icon:         React.ElementType;
  color:        string;
  bg:           string;
  items:        number;
  time:         string;
  maxScore:     number;
  description:  string;
  bands:        Band[];
  questions:    string[];
  options:      string[];
  optionValues: number[];
}

interface EvalResult {
  inst:        Instrument;
  patientName: string;
  score:       number;
  band:        Band;
  answers:     Record<number, number>;
}

// ─── Instrument data ──────────────────────────────────────────────────────────

const INSTRUMENTS: Instrument[] = [
  {
    id: 'phq9', code: 'PHQ-9', name: 'Patient Health Questionnaire', category: 'Depresión',
    Icon: HeartCrack, color: '#6366f1', bg: '#eef2ff',
    items: 9, time: '3–5 min', maxScore: 27,
    description: 'Escala de 9 ítems para evaluar la presencia y severidad de síntomas depresivos.',
    bands: [
      { min: 0,  max: 4,  label: 'Mínima o ninguna', color: '#10b981', action: 'Sin acción específica' },
      { min: 5,  max: 9,  label: 'Leve',              color: '#84cc16', action: 'Vigilancia, repetir en seguimiento' },
      { min: 10, max: 14, label: 'Moderada',           color: '#f59e0b', action: 'Plan de tratamiento, considerar terapia' },
      { min: 15, max: 19, label: 'Moderada-grave',     color: '#f97316', action: 'Tratamiento activo y seguimiento cercano' },
      { min: 20, max: 27, label: 'Grave',              color: '#ef4444', action: 'Tratamiento inmediato' },
    ],
    questions: [
      'Poco interés o placer en hacer las cosas',
      'Se ha sentido decaído(a), deprimido(a) o sin esperanzas',
      'Dificultad para dormir, mantenerse dormido(a) o ha dormido demasiado',
      'Se ha sentido cansado(a) o con poca energía',
      'Falta de apetito o ha comido demasiado',
      'Se ha sentido mal consigo mismo(a), o que es un fracaso o que ha fallado a sí mismo(a) o a su familia',
      'Dificultad para concentrarse en cosas tales como leer el periódico o ver televisión',
      'Se ha movido o hablado tan lento que otras personas podrían notarlo; o lo contrario — ha estado tan intranquilo(a) que ha estado moviéndose mucho más de lo usual',
      'Pensamientos de que sería mejor estar muerto(a) o de que se haría algún daño de alguna forma',
    ],
    options: ['Nunca', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días'],
    optionValues: [0, 1, 2, 3],
  },
  {
    id: 'gad7', code: 'GAD-7', name: 'Generalized Anxiety Disorder Scale', category: 'Ansiedad',
    Icon: Zap, color: '#f59e0b', bg: '#fffbeb',
    items: 7, time: '2–4 min', maxScore: 21,
    description: 'Instrumento de 7 ítems para la detección y medida de la severidad del trastorno de ansiedad generalizada.',
    bands: [
      { min: 0,  max: 4,  label: 'Mínima',   color: '#10b981', action: 'Sin acción específica' },
      { min: 5,  max: 9,  label: 'Leve',      color: '#84cc16', action: 'Monitorear, repetir si persiste' },
      { min: 10, max: 14, label: 'Moderada',  color: '#f59e0b', action: 'Plan de tratamiento indicado' },
      { min: 15, max: 21, label: 'Grave',     color: '#ef4444', action: 'Evaluación y tratamiento inmediato' },
    ],
    questions: [
      'Sentirse nervioso(a), angustiado(a) o con los nervios de punta',
      'No poder dejar de preocuparse o no poder controlar la preocupación',
      'Preocuparse demasiado por diferentes cosas',
      'Dificultad para relajarse',
      'Estar tan intranquilo(a) que es difícil permanecer sentado(a) tranquilo(a)',
      'Molestarse o ponerse irritable fácilmente',
      'Sentir miedo de que algo terrible puede pasar',
    ],
    options: ['Nunca', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días'],
    optionValues: [0, 1, 2, 3],
  },
  {
    id: 'dass21', code: 'DASS-21', name: 'Depression Anxiety Stress Scales', category: 'Multidimensional',
    Icon: Layers, color: '#8b5cf6', bg: '#f5f3ff',
    items: 21, time: '8–10 min', maxScore: 63,
    description: 'Evalúa simultáneamente tres dimensiones: depresión, ansiedad y estrés mediante 21 ítems.',
    bands: [{ min: 0, max: 63, label: 'Ver subescalas', color: '#8b5cf6', action: 'Interpretar subescalas individualmente' }],
    questions: [], options: [], optionValues: [],
  },
  {
    id: 'pcl5', code: 'PCL-5', name: 'PTSD Checklist for DSM-5', category: 'Trauma',
    Icon: ShieldAlert, color: '#ef4444', bg: '#fef2f2',
    items: 20, time: '5–7 min', maxScore: 80,
    description: 'Escala de 20 ítems que evalúa los síntomas del TEPT según los criterios del DSM-5.',
    bands: [
      { min: 0,  max: 30, label: 'Probable ausencia', color: '#10b981', action: '' },
      { min: 31, max: 80, label: 'TEPT probable',     color: '#ef4444', action: 'Evaluación diagnóstica completa' },
    ],
    questions: [], options: [], optionValues: [],
  },
  {
    id: 'rosenberg', code: 'Rosenberg', name: 'Escala de Autoestima de Rosenberg', category: 'Autoestima',
    Icon: Star, color: '#10b981', bg: '#ecfdf5',
    items: 10, time: '2–3 min', maxScore: 40,
    description: 'Mide la autoestima global mediante 10 ítems con formato Likert de 4 puntos.',
    bands: [
      { min: 30, max: 40, label: 'Alta autoestima', color: '#10b981', action: '' },
      { min: 26, max: 29, label: 'Media',           color: '#f59e0b', action: '' },
      { min: 0,  max: 25, label: 'Baja autoestima', color: '#ef4444', action: 'Intervención enfocada en autoconcepto' },
    ],
    questions: [], options: [], optionValues: [],
  },
  {
    id: 'burns', code: 'Burns', name: 'Inventario de Depresión de Burns', category: 'Depresión',
    Icon: Thermometer, color: '#f97316', bg: '#fff7ed',
    items: 25, time: '5–8 min', maxScore: 100,
    description: 'Evalúa la severidad de los síntomas depresivos mediante 25 ítems sobre la última semana.',
    bands: [], questions: [], options: [], optionValues: [],
  },
];

// ─── Static history (no API yet) ─────────────────────────────────────────────

interface HistoryEntry {
  date:      string;
  patient:   string;
  color:     string;
  tool:      string;
  score:     number;
  max:       number;
  severity:  string;
  sessionN:  number;
  change:    number | null;
}

const MOCK_HISTORY: HistoryEntry[] = [
  { date: '24 may 2026', patient: 'Ana Ríos',     color: '#6366f1', tool: 'PHQ-9',   score: 8,  max: 27, severity: 'Leve',          sessionN: 5, change: -3   },
  { date: '24 may 2026', patient: 'Ana Ríos',     color: '#6366f1', tool: 'GAD-7',   score: 7,  max: 21, severity: 'Leve',          sessionN: 5, change: -2   },
  { date: '17 may 2026', patient: 'Carlos M.',    color: '#f59e0b', tool: 'PHQ-9',   score: 11, max: 27, severity: 'Moderada',      sessionN: 7, change: -2   },
  { date: '17 may 2026', patient: 'Carlos M.',    color: '#f59e0b', tool: 'GAD-7',   score: 9,  max: 21, severity: 'Leve',          sessionN: 7, change: -4   },
  { date: '10 may 2026', patient: 'Ana Ríos',     color: '#6366f1', tool: 'PHQ-9',   score: 14, max: 27, severity: 'Moderada',      sessionN: 3, change: -5   },
  { date: '10 may 2026', patient: 'Ana Ríos',     color: '#6366f1', tool: 'DASS-21', score: 28, max: 63, severity: 'Moderada',      sessionN: 3, change: null },
  { date: '03 may 2026', patient: 'Isabella C.',  color: '#ef4444', tool: 'PCL-5',   score: 38, max: 80, severity: 'Probable TEPT', sessionN: 2, change: null },
  { date: '26 abr 2026', patient: 'Ana Ríos',     color: '#6366f1', tool: 'PHQ-9',   score: 19, max: 27, severity: 'Mod.-grave',    sessionN: 1, change: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function patientLabel(p: Patient) {
  return [p.first_name, p.paternal_last_name].filter(Boolean).join(' ');
}

function patientInitials(p: Patient) {
  const f = p.first_name?.[0] ?? '';
  const l = p.paternal_last_name?.[0] ?? '';
  return (f + l).toUpperCase();
}

function getBand(inst: Instrument, score: number): Band {
  return inst.bands.find(b => score >= b.min && score <= b.max) ?? inst.bands[inst.bands.length - 1];
}

function severityColor(s: string): string {
  if (s.includes('grave') || s.includes('TEPT') || s.includes('Grave')) return '#ef4444';
  if (s.includes('Mod')) return '#f59e0b';
  if (s.includes('Leve')) return '#84cc16';
  return '#10b981';
}

// ─── InstrumentCard ───────────────────────────────────────────────────────────

function InstrumentCard({
  inst, onStart, selectedId,
}: { inst: Instrument; onStart: (i: Instrument) => void; selectedId: string | null }) {
  const isSel = selectedId === inst.id;
  return (
    <div
      onClick={() => onStart(inst)}
      style={{
        background: '#fff', borderRadius: 14,
        border: `1.5px solid ${isSel ? inst.color : 'var(--s200)'}`,
        padding: 18, cursor: 'pointer', transition: 'all .15s',
        boxShadow: isSel ? `0 4px 16px ${inst.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
        transform: isSel ? 'translateY(-1px)' : '',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { if (!isSel) { e.currentTarget.style.borderColor = inst.color + '66'; e.currentTarget.style.boxShadow = `0 4px 12px ${inst.color}14`; } }}
      onMouseLeave={e => { if (!isSel) { e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; } }}
    >
      {isSel && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${inst.color},${inst.color}88)` }} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: inst.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <inst.Icon size={18} color={inst.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: inst.color, fontFamily: "'DM Mono', monospace", letterSpacing: '.04em' }}>{inst.code}</span>
            <span style={{ fontSize: 11, color: 'var(--s400)', background: 'var(--s100)', borderRadius: 5, padding: '1px 6px' }}>{inst.category}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', lineHeight: 1.3 }}>{inst.name}</div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--s500)', lineHeight: 1.6, marginBottom: 14 }}>{inst.description}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--s400)' }}>
          <List size={12} />{inst.items} ítems
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--s400)' }}>
          <Clock size={12} />{inst.time}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={e => { e.stopPropagation(); onStart(inst); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: isSel ? inst.color : '#fff',
            color: isSel ? '#fff' : inst.color,
            border: `1.5px solid ${inst.color}`,
            borderRadius: 8, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, transition: 'all .12s',
          }}
          onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = inst.color; e.currentTarget.style.color = '#fff'; } }}
          onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = inst.color; } }}
        >
          <Play size={12} />
          {isSel ? 'En curso' : 'Aplicar'}
        </button>
      </div>
    </div>
  );
}

// ─── QuestionnairePanel ───────────────────────────────────────────────────────

function QuestionnairePanel({
  inst, patientName, onComplete, onCancel,
}: {
  inst:        Instrument;
  patientName: string;
  onComplete:  (r: EvalResult) => void;
  onCancel:    () => void;
}) {
  const [answers, setAnswers]     = useState<Record<number, number>>({});
  const [currentQ, setCurrentQ]   = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const total    = inst.questions.length;
  const answered = Object.keys(answers).length;
  const progress = total > 0 ? (answered / total) * 100 : 0;
  const score    = (Object.values(answers) as number[]).reduce((a, b) => a + b, 0);
  const allDone  = answered === total && total > 0;
  const currentBand = allDone ? getBand(inst, score) : null;

  const handleAnswer = (qIdx: number, val: number) => {
    setAnswers(prev => ({ ...prev, [qIdx]: val }));
    if (qIdx < total - 1) setTimeout(() => setCurrentQ(qIdx + 1), 220);
  };

  const handleSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      onComplete({ inst, patientName, score, band: getBand(inst, score), answers });
    }, 1400);
  };

  if (total === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--s400)', padding: 40 }}>
      <div style={{ width: 60, height: 60, borderRadius: 99, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Wrench size={26} color="var(--s300)" />
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--s600)' }}>Instrumento en configuración</div>
      <div style={{ fontSize: 13, color: 'var(--s400)', textAlign: 'center', maxWidth: 300 }}>Este instrumento estará disponible próximamente en la plataforma.</div>
      <button onClick={onCancel} style={{ background: 'var(--s100)', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13, color: 'var(--s600)', fontWeight: 500, cursor: 'pointer' }}>
        ← Volver
      </button>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Progress header */}
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid var(--s200)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: inst.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <inst.Icon size={15} color={inst.color} />
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>{inst.code}</span>
              <span style={{ fontSize: 12.5, color: 'var(--s400)', marginLeft: 8 }}>— {patientName}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: allDone ? '#10b981' : 'var(--s500)' }}>
              {answered}/{total} respondidas
            </span>
            <button onClick={onCancel} style={{ border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: 'var(--s500)', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--s100)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: allDone ? '#10b981' : inst.color, borderRadius: 99, transition: 'width .35s ease' }} />
        </div>
      </div>

      {/* Questions */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ background: 'var(--s50)', border: '1px solid var(--s200)', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 10 }}>
          <Info size={15} color="var(--s400)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: 'var(--s600)', lineHeight: 1.65, margin: 0 }}>
            Durante las <strong>últimas 2 semanas</strong>, ¿con qué frecuencia le han molestado los siguientes problemas?
            Selecciona la opción que mejor describe tu experiencia.
          </p>
        </div>

        <div style={{ maxWidth: 680 }}>
          {inst.questions.map((q, idx) => {
            const isActive = currentQ === idx;
            const isDone   = answers[idx] !== undefined;
            const val      = answers[idx];

            return (
              <div
                key={idx}
                onClick={() => setCurrentQ(idx)}
                style={{
                  background: '#fff', borderRadius: 14,
                  border: `1.5px solid ${isDone ? inst.color + '40' : isActive ? inst.color : 'var(--s200)'}`,
                  padding: '20px 22px', marginBottom: 12,
                  boxShadow: isActive && !isDone ? `0 4px 16px ${inst.color}14` : 'none',
                  opacity: !isActive && !isDone ? 0.75 : 1,
                  transition: 'all .15s', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: isDone ? 0 : 16 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: isDone ? inst.color : 'var(--s100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    color: isDone ? '#fff' : 'var(--s500)',
                    transition: 'all .2s',
                  }}>
                    {isDone ? <Check size={13} color="white" /> : idx + 1}
                  </div>
                  <p style={{ flex: 1, fontSize: 14, lineHeight: 1.7, color: 'var(--s800)', fontWeight: isDone ? 400 : 500, paddingTop: 2, margin: 0 }}>
                    {q}
                    {isDone && (
                      <span style={{ display: 'inline-block', marginLeft: 10, fontSize: 12, fontWeight: 600, color: inst.color, background: inst.bg, borderRadius: 6, padding: '2px 8px' }}>
                        {inst.options[val]}
                      </span>
                    )}
                  </p>
                </div>

                {(isActive || !isDone) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginLeft: 42 }}>
                    {inst.options.map((opt, oi) => {
                      const chosen = val === inst.optionValues[oi];
                      return (
                        <button
                          key={oi}
                          onClick={e => { e.stopPropagation(); handleAnswer(idx, inst.optionValues[oi]); }}
                          style={{
                            padding: '10px 8px', borderRadius: 9,
                            border: `1.5px solid ${chosen ? inst.color : 'var(--s200)'}`,
                            background: chosen ? inst.color : '#fff',
                            color: chosen ? '#fff' : 'var(--s600)',
                            fontSize: 12.5, fontWeight: chosen ? 700 : 400,
                            transition: 'all .12s', textAlign: 'center', lineHeight: 1.3, cursor: 'pointer',
                          }}
                          onMouseEnter={e => { if (!chosen) { e.currentTarget.style.borderColor = inst.color; e.currentTarget.style.background = inst.bg; } }}
                          onMouseLeave={e => { if (!chosen) { e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.background = '#fff'; } }}
                        >
                          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 3, color: chosen ? '#fff' : inst.color }}>{oi}</div>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live score */}
        {answered > 0 && (
          <div style={{ maxWidth: 680, marginTop: 20, padding: '16px 20px', background: '#fff', borderRadius: 14, border: `1.5px solid ${allDone ? '#10b981' : 'var(--s200)'}`, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: allDone ? (currentBand?.color ?? inst.color) : inst.color, letterSpacing: '-2px', lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 2 }}>de {inst.maxScore}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--s200)' }} />
            <div style={{ flex: 1 }}>
              {allDone ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>
                    Resultado: <span style={{ color: currentBand?.color }}>{currentBand?.label}</span>
                  </div>
                  {currentBand?.action && <div style={{ fontSize: 12.5, color: 'var(--s500)', marginTop: 3 }}>{currentBand.action}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>Puntaje parcial: {score}</div>
                  <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{total - answered} preguntas restantes</div>
                </>
              )}
            </div>
            {allDone && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: submitting ? 'var(--s200)' : '#10b981', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 4px 14px rgba(16,185,129,0.35)', transition: 'all .15s',
                }}
              >
                {submitting ? (
                  <><span style={{ width: 15, height: 15, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />Guardando…</>
                ) : (
                  <><Save size={15} color="white" />Guardar resultado</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ResultsPanel ─────────────────────────────────────────────────────────────

function ResultsPanel({
  result, onNew,
}: { result: EvalResult; onNew: () => void }) {
  const { inst, patientName, score, band, answers } = result;
  const pct = Math.round((score / inst.maxScore) * 100);
  const today = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 28 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>

        {/* Success header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 72, height: 72, borderRadius: 99, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle size={36} color="#10b981" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--s800)', letterSpacing: '-0.4px' }}>Evaluación completada</div>
          <div style={{ fontSize: 13.5, color: 'var(--s400)', marginTop: 6 }}>
            {inst.code} · {patientName} · {today}
          </div>
        </div>

        {/* Score card */}
        <div style={{ background: '#fff', borderRadius: 18, border: `1.5px solid ${band.color}33`, boxShadow: `0 8px 32px ${band.color}14`, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ height: 6, background: `linear-gradient(90deg,${band.color},${band.color}66)` }} />
          <div style={{ padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 24 }}>
              {/* Score donut */}
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ position: 'relative', width: 100, height: 100 }}>
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--s100)" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="42" fill="none" stroke={band.color} strokeWidth="10"
                      strokeDasharray={`${pct * 2.638} 263.8`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      style={{ transition: 'stroke-dasharray 1s ease' }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: band.color, lineHeight: 1 }}>{score}</span>
                    <span style={{ fontSize: 11, color: 'var(--s400)' }}>/{inst.maxScore}</span>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--s500)', marginBottom: 4 }}>Nivel de severidad</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: band.color, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 8 }}>{band.label}</div>
                {band.action && (
                  <div style={{ fontSize: 13.5, color: 'var(--s600)', lineHeight: 1.6, padding: '10px 14px', background: band.color + '10', borderRadius: 9, borderLeft: `3px solid ${band.color}` }}>
                    {band.action}
                  </div>
                )}
              </div>
            </div>

            {/* Bands reference */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--s500)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Rangos de interpretación</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {inst.bands.map((b, i) => {
                  const active = score >= b.min && score <= b.max;
                  return (
                    <div key={i} style={{ flex: 1, minWidth: 80, padding: '8px 10px', borderRadius: 8, background: b.color + (active ? '22' : '0d'), border: `1.5px solid ${b.color + (active ? '' : '22')}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: b.color }}>{b.min}–{b.max}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--s700)', fontWeight: active ? 700 : 400 }}>{b.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Item breakdown */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', padding: '20px 22px', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
            <ListChecks size={15} color={inst.color} />
            Respuestas por ítem
          </div>
          {inst.questions.map((q, i) => {
            const val    = answers[i] ?? 0;
            const maxVal = Math.max(...inst.optionValues);
            const pctItem = (val / maxVal) * 100;
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  marginBottom: i < inst.questions.length - 1 ? 10 : 0,
                  paddingBottom: i < inst.questions.length - 1 ? 10 : 0,
                  borderBottom: i < inst.questions.length - 1 ? '1px solid var(--s50)' : 'none',
                }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, background: `${inst.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: inst.color, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--s700)', marginBottom: 4, lineHeight: 1.4 }}>{q}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'var(--s100)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pctItem}%`, background: val === maxVal ? '#ef4444' : val > 0 ? inst.color : 'var(--s200)', borderRadius: 99, transition: 'width .6s ease' }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: val === maxVal ? '#ef4444' : inst.color, minWidth: 50 }}>{inst.options[val]}</span>
                  </div>
                </div>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 800, color: val >= 2 ? '#ef4444' : val === 1 ? '#f59e0b' : 'var(--s300)', minWidth: 20, textAlign: 'right' }}>{val}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onNew}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 500, color: 'var(--s600)', cursor: 'pointer', transition: 'background .12s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--s50)'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            <RefreshCw size={15} />Nueva evaluación
          </button>
          <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', background: 'linear-gradient(135deg, var(--teal), var(--teal-d))', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 14px rgba(14,118,110,0.30)' }}>
            <FileText size={15} color="white" />Añadir a historia clínica
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  return (
    <div style={{ padding: '0 28px 28px', flex: 1, overflow: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={15} color="var(--teal)" />
            Historial completo de evaluaciones
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--s200)', background: '#fff', borderRadius: 8, padding: '6px 13px', fontSize: 12.5, color: 'var(--s600)', cursor: 'pointer' }}>
            <Download size={13} />Exportar
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '110px 180px 80px 100px 1fr 70px 80px', padding: '9px 20px', background: 'var(--s50)', borderBottom: '1px solid var(--s100)' }}>
          {['Fecha', 'Paciente', 'Ses.', 'Escala', 'Severidad', 'Puntaje', 'Cambio'].map(h => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</div>
          ))}
        </div>

        {MOCK_HISTORY.map((r, i) => {
          const sc = severityColor(r.severity);
          return (
            <div
              key={i}
              style={{ display: 'grid', gridTemplateColumns: '110px 180px 80px 100px 1fr 70px 80px', padding: '13px 20px', borderBottom: i < MOCK_HISTORY.length - 1 ? '1px solid var(--s100)' : 'none', alignItems: 'center', transition: 'background .12s', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontSize: 12.5, color: 'var(--s500)' }}>{r.date}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 26, height: 26, borderRadius: 99, background: r.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: r.color, flexShrink: 0 }}>
                  {r.patient.slice(0, 2).toUpperCase()}
                </div>
                <span style={{ fontSize: 13, color: 'var(--s700)', fontWeight: 500 }}>{r.patient}</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>#{r.sessionN}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>{r.tool}</div>
              <div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: sc, background: sc + '18', borderRadius: 6, padding: '3px 9px' }}>{r.severity}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{r.score}</span>
                <div style={{ width: 28, height: 4, borderRadius: 99, background: 'var(--s100)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.score / r.max) * 100}%`, background: sc, borderRadius: 99 }} />
                </div>
              </div>
              <div>
                {r.change === null ? (
                  <span style={{ fontSize: 12, color: 'var(--s400)' }}>—</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 700, color: r.change > 0 ? '#ef4444' : '#10b981' }}>
                    {r.change > 0 ? <TrendingUp size={12} color="#ef4444" /> : <TrendingDown size={12} color="#10b981" />}
                    {r.change > 0 ? '+' : ''}{r.change}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EvaluationsPage ──────────────────────────────────────────────────────────

type ViewMode = 'list' | 'apply' | 'result';
type TabId    = 'instruments' | 'history';

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#ef4444'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function EvaluationsPage() {
  const [view, setView]         = useState<ViewMode>('list');
  const [tab, setTab]           = useState<TabId>('instruments');
  const [selInst, setSelInst]   = useState<Instrument | null>(null);
  const [selPatientId, setSelPatientId] = useState<string>('');
  const [result, setResult]     = useState<EvalResult | null>(null);
  const [catFilter, setCatFilter] = useState('Todos');

  const { data: patients = [], isLoading: pLoading } = useQuery<Patient[]>({
    queryKey: ['patients-short'],
    queryFn: () => patientsApi.list({ limit: 50 }),
    staleTime: 5 * 60_000,
  });

  const selPatient = patients.find(p => p.id === selPatientId) ?? patients[0] ?? null;

  const cats = useMemo(() => ['Todos', ...Array.from(new Set(INSTRUMENTS.map(i => i.category)))], []);
  const filtered = catFilter === 'Todos' ? INSTRUMENTS : INSTRUMENTS.filter(i => i.category === catFilter);

  const handleStart = (inst: Instrument) => {
    setSelInst(inst);
    setView('apply');
  };

  const handleComplete = (r: EvalResult) => {
    setResult(r);
    setView('result');
  };

  const handleNew = () => {
    setSelInst(null);
    setResult(null);
    setView('list');
  };

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Sub-topbar ────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--s200)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, height: 44 }}>
        {view !== 'list' ? (
          <>
            <button
              onClick={handleNew}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', fontSize: 13, color: 'var(--s500)', padding: '4px 8px', borderRadius: 7, cursor: 'pointer', transition: 'background .12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s100)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ArrowLeft size={14} />Evaluaciones
            </button>
            <span style={{ color: 'var(--s300)', fontSize: 16, margin: '0 4px' }}>/</span>
            {view === 'apply' && selInst && (
              <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--s800)' }}>
                {selInst.code} — {selPatient ? patientLabel(selPatient) : '—'}
              </span>
            )}
            {view === 'result' && result && (
              <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--s800)' }}>
                Resultado {result.inst.code}
              </span>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
              <ClipboardList size={15} color="var(--teal)" />
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>Evaluaciones Psicométricas</span>
            </div>
            {[
              { id: 'instruments' as TabId, icon: LayoutGrid, label: 'Instrumentos' },
              { id: 'history'     as TabId, icon: Clock,      label: 'Historial'    },
            ].map(({ id, icon: Icon, label }) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '13px 16px', border: 'none', background: 'transparent',
                    color: on ? 'var(--teal-d)' : 'var(--s500)',
                    fontWeight: on ? 700 : 400, fontSize: 13.5,
                    borderBottom: `2px solid ${on ? 'var(--teal)' : 'transparent'}`,
                    transition: 'all .15s', cursor: 'pointer',
                  }}
                >
                  <Icon size={14} color={on ? 'var(--teal)' : 'currentColor'} />
                  {label}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* ── List view ─────────────────────────────────────────────────────────── */}
      {view === 'list' && tab === 'instruments' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          {/* Patient selector + category filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid var(--s200)', borderRadius: 10, padding: '8px 14px' }}>
              <UserRound size={14} color="var(--teal)" />
              <span style={{ fontSize: 13, color: 'var(--s600)', fontWeight: 500 }}>Paciente:</span>
              {pLoading ? (
                <Spinner size={14} color="var(--teal)" />
              ) : (
                <select
                  value={selPatientId || selPatient?.id || ''}
                  onChange={e => setSelPatientId(e.target.value)}
                  style={{ border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: 'var(--s800)', background: 'transparent', cursor: 'pointer' }}
                >
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{patientLabel(p)}</option>
                  ))}
                  {patients.length === 0 && <option value="">Sin pacientes activos</option>}
                </select>
              )}
              {selPatient && (
                <div style={{
                  width: 24, height: 24, borderRadius: 99, flexShrink: 0,
                  background: avatarColor(patientLabel(selPatient)),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff',
                }}>
                  {patientInitials(selPatient)}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {cats.map(c => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  style={{
                    padding: '6px 14px', borderRadius: 99, border: 'none',
                    background: catFilter === c ? 'var(--teal)' : 'var(--s100)',
                    color: catFilter === c ? '#fff' : 'var(--s500)',
                    fontSize: 12.5, fontWeight: catFilter === c ? 700 : 400,
                    transition: 'all .12s', cursor: 'pointer',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 13, color: 'var(--s400)' }}>{filtered.length} instrumentos</div>
          </div>

          {/* Instrument grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {filtered.map(inst => (
              <InstrumentCard
                key={inst.id}
                inst={inst}
                onStart={handleStart}
                selectedId={selInst?.id ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {view === 'list' && tab === 'history' && <HistoryTab />}

      {/* ── Apply view ────────────────────────────────────────────────────────── */}
      {view === 'apply' && selInst && (
        <QuestionnairePanel
          inst={selInst}
          patientName={selPatient ? patientLabel(selPatient) : '—'}
          onComplete={handleComplete}
          onCancel={handleNew}
        />
      )}

      {/* ── Result view ───────────────────────────────────────────────────────── */}
      {view === 'result' && result && (
        <ResultsPanel result={result} onNew={handleNew} />
      )}
    </div>
  );
}
