import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandMark } from '@/components/ui/BrandMark';
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
      minHeight: '100dvh',
      background: 'var(--s50, #faf6ec)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid var(--s200, #e7dcc0)',
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
            fontSize: 13, color: 'var(--s500, #5f5a6e)', fontWeight: 500,
            padding: '6px 10px', borderRadius: 8,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--s100, #f4eedd)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <ArrowLeft size={15} />
          Volver
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #2a2769, #171533)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', display: 'flex' }}><BrandMark size={18} /></span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800, #22214a)' }}>Chapni</span>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--s900, #171533)', marginBottom: 8, lineHeight: 1.25 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 14, color: 'var(--s500, #5f5a6e)', marginBottom: 4 }}>{subtitle}</p>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--s400, #8f8a9e)', marginBottom: 40 }}>
          Versión: {version}
        </p>

        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 36 }}>
            <h2 style={{
              fontSize: 15, fontWeight: 700, color: 'var(--s800, #22214a)',
              marginBottom: 12, paddingBottom: 8,
              borderBottom: '1px solid var(--s200, #e7dcc0)',
            }}>
              {section.title}
            </h2>
            {section.paragraphs.map((p, j) => (
              <p key={j} style={{
                fontSize: 14, color: 'var(--s600, #4a4560)', lineHeight: 1.75,
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
          borderTop: '1px solid var(--s200, #e7dcc0)',
          fontSize: 12, color: 'var(--s400, #8f8a9e)', textAlign: 'center', lineHeight: 1.7,
        }}>
          Chapni · Historia clínica cifrada<br />
          Colombia · legal@chapni.com
        </div>
      </div>
    </div>
  );
}
