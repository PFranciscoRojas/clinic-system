interface Props { size?: number; color?: string }

export function Spinner({ size = 18, color = '#fff' }: Props) {
  return (
    <span style={{
      width: size, height: size,
      border: `2.5px solid ${color}44`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin .7s linear infinite',
      display: 'inline-block',
      flexShrink: 0,
    }} />
  );
}
