import { LegalDoc } from './LegalDoc';
import { termsContent, LEGAL_VERSION } from './content';

export function TermsPage() {
  return (
    <LegalDoc
      title="Términos y Condiciones del Servicio"
      subtitle="Ley 1480 de 2011 (Estatuto del Consumidor) · Colombia"
      sections={termsContent}
      version={LEGAL_VERSION}
    />
  );
}
