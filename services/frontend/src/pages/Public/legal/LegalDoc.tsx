import { useNavigate } from 'react-router-dom';
import { Brain, ArrowLeft } from 'lucide-react';
import type { LegalSection } from './content';

interface Props {
  title: string;
  subtitle?: string;
  sections: LegalSection[];
  version: string;
}

export function LegalDoc({ title, subtitle, sections, version }: Props) {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--s50, #f8fafc)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid var(--s200, #e2e8f0)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, color: 'var(--s500, #64748b)', fontWeight: 500,
            padding: '6px 10px', borderRadius: 8,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--s100, #f1f5f9)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <ArrowLeft size={15} />
          Volver
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #0f766e, #134e4a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={16} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800, #1e293b)' }}>SGHCP</span>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--s900, #0f172a)', marginBottom: 8, lineHeight: 1.25 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 14, color: 'var(--s500, #64748b)', marginBottom: 4 }}>{subtitle}</p>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--s400, #94a3b8)', marginBottom: 40 }}>
          Versión: {version}
        </p>

        {/* Disclaimer */}
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
          padding: '13px 16px', marginBottom: 36, fontSize: 13, color: '#92400e', lineHeight: 1.6,
        }}>
          Este documento es un borrador redactado como base informativa. Para plena validez jurídica,
          consulte con un abogado especializado en derecho colombiano antes del lanzamiento comercial.
        </div>

        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 36 }}>
            <h2 style={{
              fontSize: 15, fontWeight: 700, color: 'var(--s800, #1e293b)',
              marginBottom: 12, paddingBottom: 8,
              borderBottom: '1px solid var(--s200, #e2e8f0)',
            }}>
              {section.title}
            </h2>
            {section.paragraphs.map((p, j) => (
              <p key={j} style={{
                fontSize: 14, color: 'var(--s600, #475569)', lineHeight: 1.75,
                marginBottom: j < section.paragraphs.length - 1 ? 12 : 0,
                whiteSpace: 'pre-line',
              }}>
                {p}
              </p>
            ))}
          </div>
        ))}

        <div style={{
          marginTop: 60, paddingTop: 24,
          borderTop: '1px solid var(--s200, #e2e8f0)',
          fontSize: 12, color: 'var(--s400, #94a3b8)', textAlign: 'center', lineHeight: 1.7,
        }}>
          SGHCP · Sistema de Gestión de Historias Clínicas Psicológicas<br />
          Colombia · franciscorojas92@gmail.com
        </div>
      </div>
    </div>
  );
}
