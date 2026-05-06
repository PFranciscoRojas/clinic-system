import { Construction } from 'lucide-react';

export function StubPage({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Construction size={32} color="var(--s400)" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>{title}</h2>
      <p style={{ color: 'var(--s400)', fontSize: 14, margin: 0 }}>Esta sección estará disponible próximamente</p>
    </div>
  );
}
