import React, { useState } from 'react';
import { Save } from 'lucide-react';

// ── Primitives ────────────────────────────────────────────────────────────────

export function Toggle({ value, onChange, label, sub, disabled }: {
  value: boolean; onChange: (v: boolean) => void;
  label: string; sub?: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--s100)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: disabled ? 'var(--s400)' : 'var(--s800)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{sub}</div>}
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        style={{ width: 44, height: 26, borderRadius: 99, border: 'none', background: value && !disabled ? 'var(--teal)' : 'var(--s200)', position: 'relative', transition: 'background .2s', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', top: 3, left: value && !disabled ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
      </button>
    </div>
  );
}

export function FieldRow({ label, sub, children }: { label: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--s100)' }}>
      <div style={{ flex: 1, paddingTop: 2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--s800)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, minWidth: 220 }}>{children}</div>
    </div>
  );
}

export function FInput({ value, onChange, placeholder, type = 'text', mono, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; mono?: boolean; disabled?: boolean;
}) {
  const [f, setF] = useState(false);
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{
        width: '100%', padding: '8px 12px',
        border: `1.5px solid ${f ? 'var(--teal)' : 'var(--s200)'}`,
        borderRadius: 9, fontSize: 13.5, color: 'var(--s800)', background: disabled ? 'var(--s50)' : '#fff',
        boxShadow: f ? '0 0 0 3px rgba(54,50,133,0.12)' : 'none',
        transition: 'all .15s',
        fontFamily: mono ? "'DM Mono', monospace" : "'DM Sans', sans-serif",
      }}
    />
  );
}

export function FSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--s200)', borderRadius: 9, fontSize: 13.5, color: 'var(--s700)', background: '#fff', cursor: 'pointer' }}
    >
      {children}
    </select>
  );
}

export function SectionCard({ title, icon: Icon, color = 'var(--teal)', children }: {
  title: string; icon: React.ElementType; color?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--s100)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>{title}</span>
      </div>
      <div style={{ padding: '4px 22px 8px' }}>{children}</div>
    </div>
  );
}

// ── SaveBar ───────────────────────────────────────────────────────────────────

export function SaveBar({ dirty, saving, saved, onSave }: {
  dirty: boolean; saving: boolean; saved: boolean; onSave: (doSave: boolean) => void;
}) {
  if (!dirty && !saved) return null;
  return (
    <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid var(--s200)', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', zIndex: 10 }}>
      <span style={{ fontSize: 13, color: saved ? '#10b981' : 'var(--s500)' }}>
        {saved ? '✓ Cambios guardados' : 'Tienes cambios sin guardar'}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {dirty && (
          <button
            onClick={() => onSave(false)}
            style={{ padding: '8px 18px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', color: 'var(--s600)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Descartar
          </button>
        )}
        <button
          onClick={() => onSave(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 8px rgba(54,50,133,.35)', transition: 'filter .15s', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.07)')}
          onMouseLeave={e => (e.currentTarget.style.filter = '')}
        >
          {saving
            ? <span style={{ width: 14, height: 14, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: 99, animation: 'spin .7s linear infinite', display: 'inline-block' }} />
            : <Save size={14} />
          }
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

// ── Chip button helper ────────────────────────────────────────────────────────

export function ChipBtn({ active, color = 'var(--teal)', onClick, children }: {
  active: boolean; color?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 4px', borderRadius: 9, fontSize: 13, transition: 'all .12s', cursor: 'pointer',
        border: `1.5px solid ${active ? color : 'var(--s200)'}`,
        background: active ? color + '1a' : '#fff',
        color: active ? color : 'var(--s500)',
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
    </button>
  );
}

// ── Profile section ───────────────────────────────────────────────────────────

