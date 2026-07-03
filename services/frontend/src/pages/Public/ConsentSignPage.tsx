import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, FileCheck } from 'lucide-react';
import { publicConsentsApi, type PublicConsentInfo } from '@/api/clinicalRecords';
import { Spinner } from '@/components/ui/Spinner';
import { SignatureCanvas } from '@/components/consents/SignatureCanvas';

type PageState = 'loading' | 'ready' | 'signing' | 'done' | 'error';

// Public remote-signature page (/sign/:token) — opened from the email link,
// mobile-first, no auth: the single-use token is the credential.
export function ConsentSignPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [info, setInfo] = useState<PublicConsentInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    publicConsentsApi.get(token)
      .then(data => { setInfo(data); setState('ready'); })
      .catch((e: Error & { status?: number }) => {
        setErrorMsg(tokenErrorMessage(e));
        setState('error');
      });
  }, [token]);

  const handleSign = async () => {
    if (!token || !signature) return;
    setState('signing');
    try {
      await publicConsentsApi.sign(token, { accepted: true, signature_png: signature });
      setState('done');
    } catch (e) {
      setErrorMsg(tokenErrorMessage(e as Error & { status?: number }));
      setState('error');
    }
  };

  const canSign = accepted && !!signature;

  return (
    <div style={{ minHeight: '100dvh', background: '#faf6ec', padding: '20px 12px', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {info?.org_name && (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#363285' }}>{info.org_name}</p>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '28px 24px' }}>
          {state === 'loading' && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spinner size={28} color="#363285" />
            </div>
          )}

          {state === 'error' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <AlertTriangle size={40} color="#d97706" style={{ marginBottom: 14 }} />
              <p style={{ margin: 0, fontSize: 15, color: '#444', lineHeight: 1.6 }}>{errorMsg}</p>
            </div>
          )}

          {state === 'done' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle2 size={44} color="#059669" style={{ marginBottom: 14 }} />
              <h1 style={{ margin: '0 0 8px', fontSize: 19, color: '#1a1a1a' }}>Documento firmado</h1>
              <p style={{ margin: 0, fontSize: 14, color: '#777' }}>Gracias. Ya puedes cerrar esta página.</p>
            </div>
          )}

          {(state === 'ready' || state === 'signing') && info && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <FileCheck size={20} color="#363285" />
                <h1 style={{ margin: 0, fontSize: 17, color: '#1a1a1a', fontWeight: 700 }}>{info.title}</h1>
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: '#555' }}>
                Hola <strong>{info.patient_first_name || ''}</strong>, lee el documento completo y fírmalo al final.
              </p>

              <div style={{ maxHeight: 320, overflowY: 'auto', padding: '16px 18px', background: '#faf6ec', borderRadius: 10, marginBottom: 16, WebkitOverflowScrolling: 'touch' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#333', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{info.body}</p>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ marginTop: 3, accentColor: '#363285', width: 16, height: 16 }} />
                <span style={{ fontSize: 14, color: '#444', lineHeight: 1.5 }}>Leí y acepto el contenido de este documento</span>
              </label>

              <SignatureCanvas onChange={setSignature} />

              <button
                onClick={handleSign}
                disabled={!canSign || state === 'signing'}
                style={{
                  width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 10, border: 'none',
                  background: canSign ? '#363285' : '#d1d5db', color: '#fff',
                  fontSize: 15, fontWeight: 700, cursor: canSign ? 'pointer' : 'not-allowed',
                }}
              >
                {state === 'signing' ? 'Firmando…' : 'Firmar documento'}
              </button>
              <p style={{ margin: '12px 0 0', fontSize: 12, color: '#999', textAlign: 'center' }}>
                Tu firma, la fecha y la aceptación quedan registradas de forma segura.
              </p>
            </>
          )}
        </div>

        <p style={{ fontSize: 11.5, color: '#9b96ac', textAlign: 'center', marginTop: 20 }}>
          Con la tecnología de <span style={{ fontWeight: 600 }}>Chapni</span>
        </p>
      </div>
    </div>
  );
}

function tokenErrorMessage(e: Error & { status?: number }): string {
  if (e.status === 410) {
    return e.message.includes('already signed')
      ? 'Este documento ya fue firmado. ¡Gracias!'
      : 'Este enlace ya venció. Pídele a tu psicóloga que te envíe uno nuevo.';
  }
  if (e.status === 404) return 'Este enlace no es válido.';
  return 'No se pudo procesar la firma. Intenta de nuevo en unos minutos.';
}
