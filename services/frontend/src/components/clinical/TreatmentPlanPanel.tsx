import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, X, ChevronDown, ChevronUp, CheckCircle2, Sparkles, Pencil, Trash2, Check } from 'lucide-react';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import {
  treatmentPlansApi,
  type TreatmentPlan,
  type TreatmentGoal,
  type GoalStatus,
  type PlanStatus,
} from '@/api/treatmentPlans';
import { aiSuggestionsApi, type TreatmentPlanContent } from '@/api/aiSuggestions';
import { Spinner } from '@/components/ui/Spinner';

const GOAL_CFG: Record<GoalStatus, { label: string; color: string; bg: string }> = {
  PENDING:     { label: 'Pendiente',  color: '#92400e', bg: '#fef3c7' },
  IN_PROGRESS: { label: 'En curso',   color: '#1e40af', bg: '#dbeafe' },
  ACHIEVED:    { label: 'Logrado',    color: '#065f46', bg: '#d1fae5' },
  ABANDONED:   { label: 'Abandonado', color: '#374151', bg: '#f1f5f9' },
};

const GOAL_NEXT: Record<GoalStatus, GoalStatus[]> = {
  PENDING:     ['IN_PROGRESS', 'ACHIEVED'],
  IN_PROGRESS: ['ACHIEVED', 'ABANDONED'],
  ACHIEVED:    ['IN_PROGRESS'],
  ABANDONED:   ['IN_PROGRESS'],
};

const PLAN_CFG: Record<PlanStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: 'Activo',     color: '#1e40af', bg: '#dbeafe' },
  COMPLETED: { label: 'Completado', color: '#065f46', bg: '#d1fae5' },
  ABANDONED: { label: 'Abandonado', color: '#374151', bg: '#f1f5f9' },
};

const fmtDate = (d?: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-CO') : '');

export function TreatmentPlanPanel({ patientId, reason }: { patientId: string; reason?: string }) {
  const queryClient = useQueryClient();
  const [err, setErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['treatment-plans', patientId, reason],
    queryFn: () => treatmentPlansApi.list(patientId, reason),
  });
  const plans: TreatmentPlan[] = data?.items ?? [];
  const active = plans.find(p => p.status === 'ACTIVE');
  const past = plans.filter(p => p.status !== 'ACTIVE');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['treatment-plans', patientId] });

  if (isLoading) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'center', padding: 32 }}>
        <Spinner size={20} color="var(--teal)" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {err && (
        <div style={{ padding: '10px 16px', background: '#fee2e2', borderRadius: 10, fontSize: 13, color: '#991b1b' }}>{err}</div>
      )}

      {active ? (
        <ActivePlanCard plan={active} onChange={refresh} onError={setErr} />
      ) : (
        <NewPlanCard patientId={patientId} onCreated={refresh} onError={setErr} />
      )}

      {past.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--s100)', fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>
            Planes anteriores
          </div>
          {past.map(p => <PastPlanRow key={p.id} plan={p} />)}
        </div>
      )}
    </div>
  );
}

// Polls the latest treatment_plan suggestion until it leaves the in-progress
// states. ~90s ceiling so a stuck worker doesn't hang the UI forever.
async function pollPlanSuggestion(patientId: string): Promise<TreatmentPlanContent> {
  for (let i = 0; i < 30; i++) {
    const s = await aiSuggestionsApi.latest<TreatmentPlanContent>(patientId, 'treatment_plan');
    if (s.status === 'READY') return s.content ?? { title: null, formulation: null, goals: [] };
    if (s.status === 'FAILED') throw new Error(s.error || 'falló la sugerencia');
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('la sugerencia tardó demasiado');
}

function NewPlanCard({ patientId, onCreated, onError }: { patientId: string; onCreated: () => void; onError: (e: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [goals, setGoals] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [formulation, setFormulation] = useState('');

  const handleSuggest = async () => {
    setSuggesting(true); setCreating(true); onError('');
    try {
      await aiSuggestionsApi.request(patientId, 'treatment_plan');
      const content = await pollPlanSuggestion(patientId);
      if (content.title) setTitle(content.title);
      setFormulation(content.formulation ?? '');
      const descs = content.goals.map(g => g.description).filter(Boolean);
      if (descs.length) setGoals(descs);
    } catch {
      onError('No se pudo generar la sugerencia de IA. Puedes crear el plan manualmente.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) { onError('El plan necesita un título.'); return; }
    setSaving(true); onError('');
    try {
      await treatmentPlansApi.create(patientId, {
        title: title.trim(),
        start_date: startDate,
        goals: goals.filter(g => g.trim()).map(g => ({ description: g.trim() })),
      });
      setCreating(false); setTitle(''); setGoals(['']);
      onCreated();
    } catch { onError('Error al crear el plan terapéutico.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: creating ? '1px solid var(--s100)' : 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>
          <Target size={15} color="var(--teal)" /> Plan terapéutico
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {!creating && (
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              title="Propuesta de plan TCC generada por IA — revísala y edítala antes de crear"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 7, cursor: suggesting ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {suggesting ? <Spinner size={12} color="#7c3aed" /> : <Sparkles size={12} />}
              Sugerir con IA (TCC)
            </button>
          )}
          <button
            onClick={() => setCreating(c => !c)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: creating ? 'var(--s100)' : 'var(--teal)', color: creating ? 'var(--s700)' : '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {creating ? <X size={12} /> : <Plus size={12} />}
            {creating ? 'Cancelar' : 'Iniciar plan'}
          </button>
        </div>
      </div>

      {!creating ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <Target size={32} color="var(--s200)" style={{ marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--s400)' }}>Sin plan terapéutico activo</p>
        </div>
      ) : (
        <div style={{ padding: '16px 20px', background: 'var(--s50)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suggesting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 9 }}>
              <Spinner size={16} color="#7c3aed" />
              <span style={{ fontSize: 12.5, color: 'var(--s700)' }}>La IA está proponiendo un plan TCC a partir de la historia…</span>
            </div>
          )}
          {formulation && !suggesting && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 9 }}>
              <Sparkles size={14} color="#7c3aed" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 11.5, fontWeight: 700, color: '#6d28d9' }}>Formulación TCC sugerida (revisa y edita)</p>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--s700)', lineHeight: 1.5 }}>{formulation}</p>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 5 }}>Título del plan</label>
              <input
                autoFocus value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Ej: Manejo de ansiedad y reestructuración cognitiva"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)', boxSizing: 'border-box', background: '#fff' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 5 }}>Fecha de inicio</label>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)', boxSizing: 'border-box', background: '#fff' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 5 }}>Objetivos iniciales</label>
            {goals.map((g, i) => (
              <AutoGrowTextarea
                key={i} value={g} minRows={1}
                onChange={e => setGoals(gs => gs.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={`Objetivo ${i + 1}…`}
                style={{ marginBottom: 6 }}
              />
            ))}
            <button
              onClick={() => setGoals(gs => [...gs, ''])}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px dashed var(--s300)', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: 'var(--s500)' }}
            >
              <Plus size={11} /> Agregar otro objetivo
            </button>
          </div>

          <button
            onClick={handleCreate} disabled={saving}
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Creando…' : 'Crear plan terapéutico'}
          </button>
        </div>
      )}
    </div>
  );
}

function ActivePlanCard({ plan, onChange, onError }: { plan: TreatmentPlan; onChange: () => void; onError: (e: string) => void }) {
  const [newGoal, setNewGoal] = useState('');
  const [addingGoal, setAddingGoal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);

  const handleAddGoal = async () => {
    if (!newGoal.trim()) return;
    setSaving(true); onError('');
    try {
      await treatmentPlansApi.addGoal(plan.id, { description: newGoal.trim() });
      setNewGoal(''); setAddingGoal(false);
      onChange();
    } catch { onError('Error al agregar el objetivo.'); }
    finally { setSaving(false); }
  };

  const handleClose = async (status: PlanStatus) => {
    setSaving(true); onError('');
    try {
      await treatmentPlansApi.update(plan.id, { status });
      setClosing(false);
      onChange();
    } catch { onError('Error al cerrar el plan.'); }
    finally { setSaving(false); }
  };

  const achieved = plan.goals.filter(g => g.status === 'ACHIEVED').length;

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--s100)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>
            <Target size={15} color="var(--teal)" /> {plan.title}
          </span>
          <p style={{ margin: '4px 0 0 23px', fontSize: 12, color: 'var(--s400)' }}>
            Desde {fmtDate(plan.start_date)} · {achieved}/{plan.goals.length} objetivos logrados
          </p>
        </div>
        {!closing ? (
          <button
            onClick={() => setClosing(true)}
            style={{ padding: '7px 13px', background: '#fff', color: 'var(--s600)', border: '1px solid var(--s200)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Cerrar plan
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => handleClose('COMPLETED')} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <CheckCircle2 size={12} /> Completado
            </button>
            <button onClick={() => handleClose('ABANDONED')} disabled={saving}
              style={{ padding: '7px 12px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Abandonado
            </button>
            <button onClick={() => setClosing(false)}
              style={{ padding: '7px 9px', background: 'none', color: 'var(--s400)', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {plan.goals.map((g, idx) => (
        <GoalRow key={g.id} planId={plan.id} goal={g} last={idx === plan.goals.length - 1 && !addingGoal} onChange={onChange} onError={onError} />
      ))}

      {plan.goals.length === 0 && !addingGoal && (
        <p style={{ margin: 0, padding: '18px 20px', fontSize: 13, color: 'var(--s400)' }}>Sin objetivos todavía.</p>
      )}

      <div style={{ padding: '12px 20px', background: 'var(--s50)' }}>
        {addingGoal ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus value={newGoal} onChange={e => setNewGoal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGoal()}
              placeholder="Describe el nuevo objetivo…"
              style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)', background: '#fff' }}
            />
            <button onClick={handleAddGoal} disabled={saving}
              style={{ padding: '8px 14px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Agregar
            </button>
            <button onClick={() => { setAddingGoal(false); setNewGoal(''); }}
              style={{ padding: '8px 10px', background: 'none', color: 'var(--s400)', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => setAddingGoal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'none', border: '1px dashed var(--s300)', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: 'var(--s500)' }}>
            <Plus size={12} /> Agregar objetivo
          </button>
        )}
      </div>
    </div>
  );
}

function GoalRow({ planId, goal, last, onChange, onError }: {
  planId: string; goal: TreatmentGoal; last: boolean; onChange: () => void; onError: (e: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(goal.progress_notes ?? '');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(goal.description);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const cfg = GOAL_CFG[goal.status];

  const handleStatus = async (status: GoalStatus) => {
    onError('');
    try {
      await treatmentPlansApi.updateGoal(planId, goal.id, { status });
      onChange();
    } catch { onError('Error al actualizar el objetivo.'); }
  };

  const saveNotes = async () => {
    if (notes === (goal.progress_notes ?? '')) return;
    onError('');
    try {
      await treatmentPlansApi.updateGoal(planId, goal.id, { progress_notes: notes });
      onChange();
    } catch { onError('Error al guardar las notas de progreso.'); }
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    if (editText.trim() === goal.description) { setEditing(false); return; }
    setBusy(true); onError('');
    try {
      await treatmentPlansApi.updateGoal(planId, goal.id, { description: editText.trim() });
      setEditing(false);
      onChange();
    } catch { onError('Error al editar el objetivo.'); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true); onError('');
    try {
      await treatmentPlansApi.deleteGoal(planId, goal.id);
      onChange();
    } catch { onError('Error al eliminar el objetivo.'); setConfirmingDelete(false); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--s100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <AutoGrowTextarea
                value={editText} onChange={e => setEditText(e.target.value)}
                minRows={1} autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { setEditText(goal.description); setEditing(false); } }}
                style={{ fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={saveEdit} disabled={busy}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer' }}>
                  <Check size={11} /> Guardar
                </button>
                <button onClick={() => { setEditText(goal.description); setEditing(false); }}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s600)', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--s700)', fontWeight: 500, textDecoration: goal.status === 'ABANDONED' ? 'line-through' : 'none' }}>
              {goal.description}
            </p>
          )}
          {goal.target_date && !editing && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--s400)' }}>Meta: {fmtDate(goal.target_date)}</p>
          )}
        </div>
        {!editing && (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {GOAL_NEXT[goal.status].map(next => (
                <button key={next} onClick={() => handleStatus(next)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s600)', cursor: 'pointer' }}>
                  {GOAL_CFG[next].label}
                </button>
              ))}
            </div>
            {confirmingDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--s500)' }}>¿Eliminar?</span>
                <button onClick={handleDelete} disabled={busy}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
                  Sí
                </button>
                <button onClick={() => setConfirmingDelete(false)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s600)', cursor: 'pointer' }}>
                  No
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 2 }}>
                <button onClick={() => setEditing(true)} title="Editar objetivo"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 4 }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => setConfirmingDelete(true)} title="Eliminar objetivo"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            )}
            <button onClick={() => setExpanded(e => !e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 2 }}
              title="Notas de progreso">
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </>
        )}
      </div>
      {expanded && !editing && (
        <div style={{ padding: '0 20px 14px' }}>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
            placeholder="Notas de progreso de este objetivo… (se guardan al salir del campo)"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)', resize: 'vertical', boxSizing: 'border-box', background: 'var(--s50)', lineHeight: 1.6 }}
          />
        </div>
      )}
    </div>
  );
}

function PastPlanRow({ plan }: { plan: TreatmentPlan }) {
  const [open, setOpen] = useState(false);
  const cfg = PLAN_CFG[plan.status];
  const achieved = plan.goals.filter(g => g.status === 'ACHIEVED').length;

  return (
    <div style={{ borderBottom: '1px solid var(--s100)' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>{plan.title}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--s400)' }}>
            {fmtDate(plan.start_date)} — {fmtDate(plan.end_date)} · {achieved}/{plan.goals.length} objetivos logrados
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
        {open ? <ChevronUp size={15} color="var(--s400)" /> : <ChevronDown size={15} color="var(--s400)" />}
      </button>
      {open && (
        <div style={{ padding: '0 20px 12px' }}>
          {plan.goals.map(g => {
            const gc = GOAL_CFG[g.status];
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--s50)' }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--s600)' }}>{g.description}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: gc.bg, color: gc.color }}>{gc.label}</span>
              </div>
            );
          })}
          {plan.goals.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)' }}>Sin objetivos registrados.</p>}
        </div>
      )}
    </div>
  );
}
