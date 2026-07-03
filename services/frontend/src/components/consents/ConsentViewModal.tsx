import { useQuery } from '@tanstack/react-query';
import { X, FileCheck, AlertTriangle } from 'lucide-react';
import { consentsApi, type ConsentEvidence } from '@/api/clinicalRecords';
import { Spinner } from '@/components/ui/Spinner';

const METHOD_LABEL: Record<string, string> = {
  IN_OFFICE: 'Firmado en consultorio',
  REMOTE_LINK: 'Firmado por link remoto',
  PHYSICAL_SCAN: 'Documento físico cargado',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Shows the exact signed snapshot: document text, drawn signature or uploaded
// file, and the read-and-accepted evidence.
export function ConsentViewModal({ consentId, onClose }: { consentId: string; onClose: () => void }) {
  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['consent-document', consentId],
    queryFn: () => consentsApi.document(consentId),
  });

  const evidence: ConsentEvidence | null = (() => {
    if (!doc?.evidence) return null;
    try { return JSON.parse(doc.evidence); } catch { return null; }
  })();

  const methodLabel = doc
    ? (doc.signing_method === 'PHYSICAL_SCAN'
        ? METHOD_LABEL.PHYSICAL_SCAN
        : METHOD_LABEL[evidence?.channel ?? ''] ?? 'Firmado digitalmente')
    : '';

  const isLegacy = !!doc && !doc.template_id;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div className="card anim-fade-in" style={{ width: 680, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f3f2fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck size={18} color="var(--teal)" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--s800)' }}>Documento de consentimiento</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)' }}><X size={18} /></button>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} color="var(--teal)" /></div>
        ) : isError || !doc ? (
          <p style={{ fontSize: 13, color: 'var(--red)' }}>No se pudo cargar el documento.</p>
        ) : (
          <>
            {doc.revoked_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 9, marginBottom: 14 }}>
                <AlertTriangle size={15} color="#dc2626" />
                <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>Revocado el {fmtDate(doc.revoked_at)}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 7, background: '#d1fae5', color: '#065f46' }}>{methodLabel}</span>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 7, background: 'var(--s100)', color: 'var(--s600)' }}>Firmado el {fmtDate(doc.signed_at)}</span>
            </div>

            {isLegacy ? (
              <div style={{ padding: '16px 18px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
                  Este consentimiento se registró antes de la gestión documental — no tiene documento ni firma adjunta.
                  Puedes volver a firmarlo o subir el documento físico desde la pestaña Consentimientos.
                </p>
              </div>
            ) : (
              <>
                {doc.document_text && (
                  <div style={{ maxHeight: 280, overflowY: 'auto', padding: '16px 18px', background: 'var(--s50)', borderRadius: 10, border: '1px solid var(--s200)', marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 13.5, color: 'var(--s700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{doc.document_text}</p>
                  </div>
                )}

                {doc.signature_png && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Firma del paciente</p>
                    <img src={doc.signature_png} alt="Firma del paciente" style={{ maxWidth: '100%', border: '1px solid var(--s200)', borderRadius: 10, background: '#fff' }} />
                  </div>
                )}

                {doc.scan_file_base64 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Documento cargado</p>
                    {doc.scan_file_type === 'PDF' ? (
                      <iframe
                        title="Documento de consentimiento"
                        src={`data:application/pdf;base64,${doc.scan_file_base64}`}
                        style={{ width: '100%', height: 460, border: '1px solid var(--s200)', borderRadius: 10 }}
                      />
                    ) : (
                      <img
                        src={`data:image/${doc.scan_file_type === 'PNG' ? 'png' : 'jpeg'};base64,${doc.scan_file_base64}`}
                        alt="Documento de consentimiento firmado"
                        style={{ maxWidth: '100%', border: '1px solid var(--s200)', borderRadius: 10 }}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {evidence && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)', lineHeight: 1.6 }}>
                Aceptado el {fmtDate(evidence.accepted_at)}
                {evidence.ip ? ` · IP ${evidence.ip}` : ''}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
