import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, FileCheck, ChevronDown, CheckCircle2 } from 'lucide-react';
import { consentsApi, consentTemplatesApi, type ConsentType } from '@/api/clinicalRecords';
import { Spinner } from '@/components/ui/Spinner';
import { SignatureCanvas } from './SignatureCanvas';

// One reading + one signature for everything the patient approves.
// Each checked type still becomes its own consent record (independently
// revocable, each preserving the exact template version accepted) — the
// unification is the UX, not the legal document.

const TYPE_META: { type: ConsentType; label: string; required: boolean; hint: string }[] = [
  { type: 'TREATMENT',           label: 'Tratamiento psicológico',  required: true,  hint: 'Necesario para la atención' },
  { type: 'DATA_PROCESSING',     label: 'Tratamiento de datos',     required: true,  hint: 'Ley 1581/2012 — necesario' },
  { type: 'RECORDING',           label: 'Grabación de sesiones',    required: false, hint: 'Opcional — para el borrador automático de notas' },
  { type: 'INFORMATION_SHARING', label: 'Compartir información',    required: false, hint: 'Opcional — con terceros que el paciente autorice' },
];

interface Props {
  patientId: string;
  /** Types already signed and active — shown as done, not signable again. */
  alreadySigned?: ConsentType[];
  onClose: () => void;
  onSigned: () => void;
}

export function UnifiedConsentSignModal({ patientId, alreadySigned = [], onClose, onSigned }: Props) {
  const signedSet = new Set(alreadySigned);
  const [checked, setChecked] = useState<Set<ConsentType>>(() =>
    new Set(TYPE_META.filter(m => m.required && !signedSet.has(m.type)).map(m => m.type)));
  const [expanded, setExpanded] = useState<ConsentType | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['consent-templates'],
    queryFn: consentTemplatesApi.list,
  });
  const templates = data?.items ?? [];
  const templateOf = (t: ConsentType) => templates.find(x => x.consent_type === t);

  const toggle = (t: ConsentType) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const selected = TYPE_META.filter(m => checked.has(m.type) && !signedSet.has(m.type));
  const canSave = selected.length > 0 && accepted && !!signature && !saving;

  const handleSave = async () => {
    if (!signature) return;
    setSaving(true); setError('');
    const failed: string[] = [];
    for (const m of selected) {
      try {
        await consentsApi.sign(patientId, { consent_type: m.type, accepted: true, signature_png: signature });
      } catch {
        failed.push(m.label);
      }
    }
    setSaving(false);
    if (failed.length > 0) {
      setError(`No se pudo guardar: ${failed.join(', ')}. Los demás quedaron firmados — reintenta los pendientes.`);
      onSigned(); // refresh what did succeed
      return;
    }
    onSigned();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div className="card anim-fade-in" style={{ width: 680, maxWidth: '100%', maxHeight: '94vh', overflowY: 'auto', padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck size={18} color="var(--teal)" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--s800)' }}>Firmar consentimientos</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)' }}><X size={18} /></button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--s500)', lineHeight: 1.6 }}>
          El paciente marca lo que autoriza, lee cada documento y firma una sola vez.
          Cada autorización queda como consentimiento independiente y revocable por separado.
        </p>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} color="var(--teal)" /></div>
        ) : (
          <>
            {TYPE_META.map(m => {
              const tpl = templateOf(m.type);
              const done = signedSet.has(m.type);
              const isChecked = checked.has(m.type);
              const isOpen = expanded === m.type;
              return (
                <div key={m.type} style={{ border: `1.5px solid ${done ? '#a7f3d0' : isChecked ? 'var(--teal)' : 'var(--s200)'}`, borderRadius: 10, marginBottom: 8, background: done ? '#f0fdf4' : '#fff', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
                    {done ? (
                      <CheckCircle2 size={17} color="#10b981" style={{ flexShrink: 0 }} />
                    ) : (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!tpl}
                        onChange={() => toggle(m.type)}
                        style={{ width: 16, height: 16, accentColor: 'var(--teal)', flexShrink: 0, cursor: 'pointer' }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0, cursor: done || !tpl ? 'default' : 'pointer' }} onClick={() => { if (!done && tpl) toggle(m.type); }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--s800)' }}>
                        {tpl?.title ?? m.label}
                        {m.required && !done && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 5, padding: '1px 6px', marginLeft: 8 }}>Requerido</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: done ? '#047857' : 'var(--s400)', marginTop: 1 }}>
                        {done ? 'Ya firmado y vigente' : tpl ? m.hint : 'Sin plantilla activa — créala en Configuración'}
                      </div>
                    </div>
                    {tpl && (
                      <button
                        onClick={() => setExpanded(isOpen ? null : m.type)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 12, fontWeight: 600, padding: 4 }}
                      >
                        Leer <ChevronDown size={13} style={{ transform: isOpen ? 'rotate(180deg)' : '', transition: 'transform .2s' }} />
                      </button>
                    )}
                  </div>
                  {isOpen && tpl && (
                    <div style={{ maxHeight: 240, overflowY: 'auto', padding: '12px 16px', background: 'var(--s50)', borderTop: '1px solid var(--s100)' }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--s700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{tpl.body}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {selected.length > 0 && (
              <>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--teal)' }} />
                  <span style={{ fontSize: 13.5, color: 'var(--s700)', lineHeight: 1.5 }}>
                    El/la paciente leyó y acepta los {selected.length === 1 ? 'términos del documento seleccionado' : `términos de los ${selected.length} documentos seleccionados`}
                  </span>
                </label>

                <SignatureCanvas onChange={setSignature} />
              </>
            )}

            {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--red)' }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s600)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: canSave ? 'var(--teal)' : 'var(--s200)', color: '#fff', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}
              >
                {saving ? 'Guardando…' : selected.length > 1 ? `Firmar ${selected.length} consentimientos` : 'Firmar consentimiento'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
