import { useRef, useEffect, type TextareaHTMLAttributes } from 'react';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
}

// Textarea that grows with its content — writing a long session note never
// requires fighting a 3-row box with its own scrollbar.
export function AutoGrowTextarea({ minRows = 4, style, value, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 24)}px`;
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      {...rest}
      style={{
        width: '100%', padding: '12px 14px', borderRadius: 10,
        border: '1.5px solid var(--s200)', fontSize: 14.5, color: 'var(--s700)',
        boxSizing: 'border-box', lineHeight: 1.7, background: '#fff',
        resize: 'none', overflow: 'hidden', fontFamily: 'inherit',
        ...style,
      }}
    />
  );
}
