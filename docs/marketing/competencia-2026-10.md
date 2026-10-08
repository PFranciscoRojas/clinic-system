# Competencia — revisión 2026-10-07

Complementa `docs/history/analisis-mercado-y-plan.md` (scribes globales, SaludTools) y
`docs/marketing/voz-del-cliente-2026-08.md` (PSICONAPSIS). Aquí va lo nuevo.

## SMind (smind.com.co)

Datos sacados del JSON de la propia página (Laravel + Inertia; los planes vienen en el `data-page`),
no de terceros. La versión publicada era `v2026.10.07`: despliegan a diario, está viva.

- Origen: "una plataforma del ecosistema Sana Mente" (sanamente.com.co), al parecer un centro de
  psicología que construyó su propio software. Eso les da red y distribución dentro del gremio.
- Posicionamiento: gestión del negocio, no lo clínico. "Deja de llevar tu negocio a ciegas".
  "Global en español", precios en USD.
- Funciones: agenda, recordatorios WhatsApp (desde el plan más barato), historia clínica con notas
  firmadas, portal del paciente, factura electrónica DIAN automática post-sesión, "90 indicadores",
  detección de abandono con mensaje de reactivación automático, pacientes VIP, liquidador de
  comisiones, tesorería, metas y proyecciones. Incluyen comunidad y sesiones de acompañamiento.
- Lo que no tienen: IA, transcripción, cifrado. Ninguna mención a Res. 1995 ni Ley 1581, salvo
  "Historia clínica exportable en PDF legal" desde Growth.
- Testimonios sin nombre (Bogotá, Medellín, Cali, México) con cifras redondas. No verificables.

| Plan | Profesionales | Pacientes | USD/mes | Anual (USD/mes) |
|---|---|---|---|---|
| Starter | 1 | 100 | 29 | 22 |
| Growth | hasta 10 | 1.000 | 49 | 37 |
| Enterprise | hasta 35 | 10.000 | 99 | 75 |

Prueba 15 días sin tarjeta. Descuentos 8/15/25% trimestral/semestral/anual.

### Qué significa para Chapni

- Individual: Chapni $180.000 COP (≈ USD 45) contra USD 29. Defendible con IA local + cifrado.
- Clínica: el precio por asiento de `docs/ai/PLAN_B2B_COMERCIAL.md` §1 sale 3-4 veces más caro.
  Clínica de 5: ~$765.000/mes en Chapni contra USD 49 (~$200.000) en SMind, que cubre hasta 10.
  Antes de mostrar la tabla en entrevistas, llevar también una variante de tarifa plana por clínica.
- No competir en su terreno (dashboards, VIP, comisiones). Lo barato y valioso de copiar, solo si
  los pilotos lo piden: aviso de paciente sin cita en X días (datos de agenda ya existentes, por
  email) y una tarjeta de ingresos del mes contra meta.
- Factura DIAN vía proveedor (Alegra/Siigo) y RIPS: preguntar en las entrevistas si son gate.
- WhatsApp: SMind lo incluye en USD 29. La decisión de tenerlo apagado se basó en el cobro por
  conversación de Meta; Meta pasó a cobro por mensaje de plantilla (julio 2025, por verificar).
  No reabre la decisión, pero el cálculo de costo merece rehacerse cuando haya clientes.
- Ángulos de venta que SMind no puede contestar: quién escribe la nota, si el audio sale del país,
  quién puede leer la historia.

## Resto del mercado (búsqueda rápida)

- AgendaPro: generalista, dice +135.000 profesionales. Distribución, no especialización.
- Psika: LATAM, clínico (escalas BDI/GAD-7/PHQ-9, menores, genograma), desde USD 16 según Capterra.
- Scribes globales (Upheal, Freed, NovoNote): notas con IA en español. "La IA escribe la nota" ya
  no diferencia; "el audio no sale del servidor" sí.

## Conclusión

El cuello de botella no es la competencia sino la venta: a 2026-10-07 no hay un solo cliente
externo pagando. Ver `docs/ai/PLAN_VENTA_DIRECTA.md`.
