interface Props {
  label: string;
  color: string;
  bg: string;
  size?: 'sm' | 'md';
}

export function Badge({ label, color, bg, size = 'md' }: Props) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: size === 'sm' ? 10.5 : 11,
      fontWeight: 600,
      color,
      background: bg,
      borderRadius: 9999,
      padding: size === 'sm' ? '2px 7px' : '4px 10px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
