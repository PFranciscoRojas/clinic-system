import { useState, type InputHTMLAttributes } from 'react';
import { LucideIcon } from 'lucide-react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
}

export function Field({ label, value, onChange, icon: Icon, error, hint, type = 'text', required, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPass = type === 'password';

  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--s700)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: focused ? '#fff' : 'var(--s50)',
        border: `1.5px solid ${error ? 'var(--red)' : focused ? 'var(--teal)' : 'var(--s200)'}`,
        borderRadius: 11, padding: '11px 14px',
        transition: 'all .15s',
        boxShadow: focused ? `0 0 0 3px ${error ? '#ef444422' : 'rgba(54,50,133,.12)'}` : 'none',
      }}>
        {Icon && <Icon size={16} color={focused ? 'var(--teal)' : 'var(--s400)'} />}
        <input
          type={isPass ? (showPass ? 'text' : 'password') : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--s800)', minWidth: 0 }}
          {...rest}
        />
        {isPass && (
          <button type="button" onClick={() => setShowPass(v => !v)} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--s400)', display: 'flex' }}>
            {showPass ? <EyeOff size={15} color="var(--s400)" /> : <Eye size={15} color="var(--s400)" />}
          </button>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
          <AlertCircle size={12} color="var(--red)" />{error}
        </div>
      )}
      {hint && !error && <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 5 }}>{hint}</div>}
    </div>
  );
}
