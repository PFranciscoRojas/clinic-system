import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Brain, ArrowLeft } from 'lucide-react';
import { legalApi } from '@/api/legal';
import { Markdown } from '@/components/common/Markdown';
import { Spinner } from '@/components/ui/Spinner';

export function TermsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['legal', 'terms'],
    queryFn: () => legalApi.get('terms'),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--s50, #f8fafc)', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--s200, #e2e8f0)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--s500)', fontWeight: 500, padding: '6px 10px', borderRadius: 8 }}>
          <ArrowLeft size={15} /> Volver
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #0f766e, #134e4a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={16} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>SGHCP</span>
        </div>
      </header>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 80px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
        ) : data ? (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--s400)', marginBottom: 32 }}>Versión: {data.version} · {new Date(data.published_at).toLocaleDateString('es-CO')}</p>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '13px 16px', marginBottom: 36, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
              Este documento es un borrador redactado como base informativa. Para plena validez jurídica, consulte con un abogado especializado en derecho colombiano antes del lanzamiento comercial.
            </div>
            <Markdown content={data.body_md} />
          </>
        ) : null}
        <div style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid var(--s200)', fontSize: 12, color: 'var(--s400)', textAlign: 'center', lineHeight: 1.7 }}>
          SGHCP · Sistema de Gestión de Historias Clínicas Psicológicas<br />Colombia · franciscorojas92@gmail.com
        </div>
      </div>
    </div>
  );
}
