## Tarea en progreso
Remoción del correo personal `franciscorojas92@gmail.com` de contenido legal/consentimientos (clinic-system + `../chapni`) y reemplazo por direcciones `@chapni.com`.

## Checklist
✅ BD de producción corregida — `legal_documents` (privacy, terms) republicados sin correo personal, versión `2026-07-07`, versiones previas archivadas
✅ Fuente local actualizada — `content.ts`, `LegalDoc.tsx`, `TermsPage.tsx`, `PrivacyPage.tsx`, seed `000040_legal_documents.up.sql`
✅ Verificado: sin ocurrencias del correo en repo `../chapni`
✅ Recomendación dada al usuario: mantener `hola@chapni.com` (no cambiar a `info@chapni.com`)
⬜ Commit de los cambios locales — nada de esta sesión está commiteado aún, preguntar al usuario si procede
⬜ Rebuild manual de frontend en VPS para que `TermsPage.tsx`/`PrivacyPage.tsx` (footer) reflejen el cambio — la BD ya está corregida, solo falta el footer hardcoded en el bundle desplegado
⬜ Decidir si limpiar código muerto: `content.ts`, `LegalDoc.tsx`, constante `LEGAL_VERSION` sin uso
⬜ Decidir si vale la pena arreglar branding "SGHCP" obsoleto en migración `000040` (no afecta prod, solo instalaciones nuevas)
⬜ Decidir si limpiar `docs/history/RFC-001-Sistema-Clinico.md` (3 menciones del correo personal en logs históricos de dev, no es contenido legal)

## Último archivo
`services/frontend/src/pages/Public/legal/PrivacyPage.tsx` — cambio simple de string, no requiere compilación para verificar

## Próximo paso
Preguntar al usuario si quiere: (1) commitear los cambios ahora, (2) hacer el rebuild manual del frontend en el VPS para que el footer en vivo quede consistente con la BD ya corregida.
