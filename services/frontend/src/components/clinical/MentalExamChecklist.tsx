import { Brain } from 'lucide-react';
import type { MentalExamEntry } from '@/api/clinicalRecords';
import { MENTAL_EXAM_DOMAINS } from './constants';

export type MentalExam = Record<string, MentalExamEntry>;

// Every domain starts as NORMAL so a fully normal exam costs zero clicks —
// the professional only touches what is altered.
export function defaultMentalExam(): MentalExam {
  const exam: MentalExam = {};
  for (const d of MENTAL_EXAM_DOMAINS) exam[d.key] = { status: 'NORMAL' };
  return exam;
}

interface Props {
  value: MentalExam;
  onChange: (v: MentalExam) => void;
  disabled?: boolean;
}

export function MentalExamChecklist({ value, onChange, disabled }: Props) {
  const setDomain = (key: string, entry: MentalExamEntry) =>
    onChange({ ...value, [key]: entry });

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Brain size={15} color="var(--s500)" />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
          Examen mental <span style={{ color: '#dc2626' }}>*</span>
        </p>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--s400)' }}>
        Todos los dominios inician en normal — marca solo lo alterado.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MENTAL_EXAM_DOMAINS.map(d => {
          const entry = value[d.key] ?? { status: 'NORMAL' as const };
          const altered = entry.status === 'ALTERED';
          return (
            <div key={d.key} style={{ borderRadius: 10, border: `1px solid ${altered ? '#fde68a' : 'var(--s100)'}`, background: altered ? '#fffbeb' : '#fff', padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>{d.label}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setDomain(d.key, { status: 'NORMAL' })}
                  style={{ padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', border: `1.5px solid ${!altered ? '#6ee7b7' : 'var(--s200)'}`, background: !altered ? '#d1fae5' : '#fff', color: !altered ? '#065f46' : 'var(--s400)' }}
                >
                  Normal
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setDomain(d.key, { status: 'ALTERED', note: entry.note ?? '' })}
                  style={{ padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', border: `1.5px solid ${altered ? '#fde68a' : 'var(--s200)'}`, background: altered ? '#fef3c7' : '#fff', color: altered ? '#92400e' : 'var(--s400)' }}
                >
                  Alterado
                </button>
              </div>
              {altered && (
                <input
                  value={entry.note ?? ''}
                  disabled={disabled}
                  onChange={e => setDomain(d.key, { status: 'ALTERED', note: e.target.value })}
                  placeholder="Describe la alteración…"
                  style={{ width: '100%', marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid #fde68a', fontSize: 13, color: 'var(--s700)', boxSizing: 'border-box', background: '#fff' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
