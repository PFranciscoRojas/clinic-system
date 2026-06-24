interface Props {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: Props) {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;

  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p
    );
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      nodes.push(<h2 key={key++} style={{ fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8, color: 'var(--s800)' }}>{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      nodes.push(<h3 key={key++} style={{ fontSize: 14.5, fontWeight: 700, marginTop: 18, marginBottom: 4, color: 'var(--s700)' }}>{line.slice(4)}</h3>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      nodes.push(<ul key={key++} style={{ paddingLeft: 20, margin: '6px 0', fontSize: 13.5, color: 'var(--s700)' }}>{items}</ul>);
      continue;
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      nodes.push(<p key={key++} style={{ fontSize: 12.5, color: 'var(--s400)', fontStyle: 'italic', marginBottom: 10 }}>{line.slice(1, -1)}</p>);
    } else if (line.trim() === '') {
      // skip blank lines (spacing handled by margins)
    } else {
      nodes.push(<p key={key++} style={{ fontSize: 13.5, color: 'var(--s700)', lineHeight: 1.6, marginBottom: 8 }}>{renderInline(line)}</p>);
    }

    i++;
  }

  return <div className={className}>{nodes}</div>;
}
