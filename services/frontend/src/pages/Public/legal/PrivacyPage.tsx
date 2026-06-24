import { LegalDoc } from './LegalDoc';
import { privacyContent, LEGAL_VERSION } from './content';

export function PrivacyPage() {
  return (
    <LegalDoc
      title="Política de Tratamiento de Datos Personales"
      subtitle="Ley 1581 de 2012 · Decreto 1377 de 2013"
      sections={privacyContent}
      version={LEGAL_VERSION}
    />
  );
}
