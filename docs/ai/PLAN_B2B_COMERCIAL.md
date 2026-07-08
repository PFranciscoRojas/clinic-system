# Propuesta comercial B2B — Plan Clínica/IPS (2026-07-07)

> Origen: cierre de la "Ola B2B Clínicas" (backlog 2026-07-03/04/06). Lo técnico ya está resuelto
> (booking multi-profesional, cobro por asiento, dashboard de equipo — ver `BACKLOG.md`). Lo que
> faltaba era la propuesta comercial en sí: precio, empaquetado, brechas para vender en serio a
> una IPS, y el plan de validación. Este documento lo resuelve.
>
> Decisión de fondo tomada aquí: **no construir un segundo producto ni gatear features por plan**.
> El motor técnico (checkout por asientos hasta 100, dashboard de equipo, need-to-know, audit trail)
> ya sirve para 1 profesional o para 30. Lo que cambia entre "Individual" y "Clínica" es
> **empaquetado, descuento por volumen y proceso de venta** — no código nuevo, salvo lo listado en
> la sección 3.

---

## 1. Modelo de precios propuesto

Ancla: precio de lista actual = **$180.000 COP/mes por asiento profesional** (`../chapni/src/consts.ts`),
ya vigente para individuales vía `mp_plan_amount`. El checkout (`billing/handler.go`) ya soporta de
1 a 100 asientos con el mismo mecanismo — el descuento por volumen se aplica ajustando
`mp_plan_amount` por tramo (hoy es un único valor global; ver §3.1 para el cambio necesario).

| Plan | Asientos | Precio/asiento/mes | Descuento | Notas |
|---|---|---|---|---|
| **Profesional** | 1–2 | $180.000 COP | — | Precio de lista actual, sin cambios |
| **Clínica** | 3–9 | $153.000 COP | 15% | Autoservicio, mismo checkout MP |
| **Clínica/IPS** | 10–30 | $135.000 COP | 25% | Onboarding asistido + soporte prioritario (§2) |
| **Institucional** | 30+ | A medida | — | Requiere hablar (RIPS/multi-sede probablemente en juego, §3) |

**Anual:** prepago de 12 meses = 2 meses gratis (~16.7% adicional, acumulable con el tramo). Mejora
caja y reduce fricción de renovación mes a mes vía MP.

**Fundadoras (incentivo de lanzamiento):** las primeras 3–5 IPS que firmen antes de 2026-09-30
quedan con el precio de su tramo **congelado 12 meses** aunque la lista suba después, a cambio de:
una llamada de feedback quincenal las primeras 8 semanas, y permiso (opcional, revisado por ellas)
para usarlas como caso de referencia en marketing. Esto es lo que convierte las entrevistas de
validación (§4) en ventas reales en vez de solo research.

**Por qué estos números y no otros:** SaludTools (competidor colombiano más cercano, generalista
médico) cobra $168.000 COP en su plan Premium (`docs/history/analisis-mercado-y-plan.md`). Quedar
en $180.000 individual y bajar a $135.000 en volumen mantiene a Chapni competitivo en el tramo alto
(especialización en psicología + cifrado) sin regalar margen en el tramo bajo, donde no hay presión
de precio real todavía (ver señal de demanda §4).

---

## 2. Empaquetado — qué se vende distinto en cada plan

No hay gating técnico nuevo. Lo que cambia es **cómo se presenta** lo que ya existe:

| Feature (ya construido) | Individual | Clínica/IPS |
|---|---|---|
| Historia clínica cifrada, consentimientos, plan terapéutico | ✅ | ✅ |
| Recap IA, borrador de sesión, detección de riesgo | ✅ | ✅ |
| Booking público multi-profesional (`/book/:slug`) | ✅ (1 profesional) | ✅ — selector real de profesional |
| Dashboard "Equipo" (sesiones, ocupación, ingresos por profesional) | — (nada que agregar) | ✅ **argumento de venta central** — visibilidad que el dueño de la IPS no tiene hoy en papel/Excel |
| Need-to-know (`patient_staff_rel`) + break-the-glass con motivo | ✅ | ✅ **se vende como gobernanza clínica**, no como feature técnica — "cada acceso a un expediente queda trazado, con motivo" |
| Roles (CLINIC_ADMIN, RECEPTIONIST, PROFESSIONAL, INTERN) | limitado a 1-2 personas | ✅ separación real dueño/recepción/clínico |
| Onboarding | self-serve | **asistido** — llamada de setup, importación de tarifario/pacientes, capacitación al equipo |
| Soporte | WhatsApp best-effort | WhatsApp con SLA informal <4h hábiles |

La única cosa que sí falta construir para que este empaquetado sea honesto es el punto 3 de abajo
(descuento real por tramo en el backend — hoy `mp_plan_amount` es un solo valor).

---

## 3. Brechas a cerrar antes de vender en serio

### 3.1 Precio por tramo en el checkout (imprescindible para lanzar la tabla de §1)
Hoy `mp_plan_amount` es un único valor global (`platform_settings`), multiplicado por `seats` sin
escalón. Para que el descuento de la tabla de §1 sea real (no solo prometido a mano por WhatsApp):
- Cambiar `checkout()` en `billing/handler/handler.go:158` para resolver el precio por asiento según
  el tramo de `seats` (1-2 / 3-9 / 10-30) en vez de usar `pcfg.amount` plano.
- Migración pequeña: tabla o config `platform_settings` con los 3 quiebres, o simplemente constantes
  en código si no se espera cambiarlos seguido (más simple, YAGNI si el pricing no cambia cada mes).
- **Recomendación:** hacerlo *después* de las entrevistas de validación (§4), no antes — si el
  pricing cambia con el feedback real, evita tocar el backend dos veces.

### 3.2 RIPS/ADRES — el gap más grande frente a SaludTools/Psiris/MedSystem
Ya identificado en backlog como post-1.0. Si la IPS factura a EPS (régimen contributivo/subsidiado),
necesita generar RIPS para reportar a ADRES — sin esto, tiene que llevarlo en paralelo en otro
sistema, lo cual mata el argumento de "un solo lugar para todo". **No construir a ciegas**: es la
primera pregunta del guion de entrevista (§4) — si los 5 prospectos son mayoritariamente particular
(pago directo del paciente, no EPS), este gap no bloquea el cierre y se puede seguir postergando.

### 3.3 Factura electrónica DIAN de Chapni hacia la organización
Hoy el único comprobante que recibe quien paga es el de MercadoPago. Una IPS real (con contador,
NIT, gasto deducible) va a pedir una factura electrónica de Chapni como proveedor, no solo el
recibo del intermediario de pago. **Abrir como pregunta a resolver con contador/asesor**, no asumir
la respuesta: depende de si Chapni ya está registrada como facturador electrónico ante la DIAN. Sin
esto resuelto, un cierre institucional real (no solo un piloto informal) puede trabarse en el área
de compras/contabilidad de la IPS aunque el producto y el precio ya estén aceptados.

### 3.4 Contrato marco + DPA firmado formalmente
El DPA hoy se acepta con checkbox en el signup individual — suficiente para un profesional solo,
insuficiente para una IPS que va a querer un contrato con firma del representante legal. Preparar
una plantilla PDF de "Contrato de Prestación de Servicios + Anexo DPA" para firma digital (ej.
HelloSign, Firmafácil, o incluso firma manuscrita escaneada) reutilizando el texto legal que ya
existe (`legal_documents` en BD). Es proceso, no código.

### 3.5 Multi-sede
Confirmado fuera de alcance v1 en backlog. Preguntar en las entrevistas si algún prospecto lo
necesita de entrada (bloqueante) antes de descartarlo con más confianza.

### 3.6 Pago dirigido por profesional (split payment) — 🟡 PENDIENTE, no construir sin validar
Verificado en código (2026-07-07): hoy **todo el dinero de todas las citas de una organización va a
UNA sola cuenta de MercadoPago**, la configurada a nivel de org (`org_payment_config`, PK
`organization_id`, sin columna de profesional). El `staff_id` elegido en el wizard de booking solo
se usa para calcular horario/disponibilidad — al cobrar, `checkout()` en `billing/handler.go`
resuelve el token de MP por `orgID`, ignorando por completo qué profesional fue agendado. No existe
ningún rastro de split payment/marketplace/`recipient_id` en el código.

**Esto no es un bloqueante universal — depende del modelo de negocio de la clínica:**
- **Centralizado** (la clínica paga salario/nómina a sus profesionales, el paciente le paga a la
  clínica): ya funciona hoy, cero código nuevo.
- **Descentralizado** (profesionales independientes que arriendan consultorio/marca y deben recibir
  su propio dinero directamente): no existe hoy. MercadoPago sí lo soporta vía su modo "Marketplace"
  (OAuth por vendedor conectado + `application_fee` de comisión), pero requiere: conectar cada
  profesional a su propia cuenta MP vía OAuth, rediseñar `org_payment_config` para permitir 1 fila
  por profesional (no por org), y cambiar `checkout()` para elegir el token según `staff_id`. Cambio
  de diseño real, no trivial, pero tampoco una reescritura completa.

**Decisión:** no construir a ciegas — se agregó como pregunta explícita al guion de entrevistas
(§4, pregunta 11). Solo se dimensiona en serio si 2+ de los 5 prospectos resultan ser modelo
descentralizado.

### 3.7 Sitio web propio con dominio de la clínica + botón "Agendar" — 🟡 PENDIENTE
Idea distinta a extender `/book/:slug`: una página real con **dominio propio del profesional/clínica**
(no bajo `app.chapni.com`), con un botón que redirige a `https://app.chapni.com/book/:slug` (el
horario y el profesional sí se resuelven de verdad ahí — ver §2). Hoy no existe infraestructura de
dominio custom ni self-service de branding (ver §2, la personalización de `public_name`/`brand_color`
se edita a mano por SQL). Si se ofrece, debería ser **add-on con costo aparte, no incluido gratis en
ningún tramo** — construir/conectar un dominio por cliente es trabajo manual del fundador mientras no
haya self-service, y no escala regalado. Propuesta a validar: setup fee único (~$300.000–400.000 COP)
o gratis solo si el cliente paga anual. No priorizar hasta tener claridad de demanda (§4) y, como
mínimo, una UI de branding self-service en Settings — de lo contrario cada "página web" prometida es
trabajo manual del fundador por cliente.

---

## 4. Plan de validación — antes de publicar el precio en la landing

Antes de poner la tabla de §1 pública en `chapni.com`, correr las entrevistas ya identificadas como
pendientes en `STATUS.md`. Objetivo: no adivinar precio ni confirmar que RIPS es bloqueante sin
preguntar primero.

**A quién contactar** (ya identificadas, salud mental, Bogotá/Medellín):
1. Insight Psicología IPS
2. Clínica Retornar
3. IPS Psicoe
4. Centro Psicológico Trascender
5. Centro de Familia UPB Medellín

**Canal de abordaje:** LinkedIn o correo directo pidiendo 20-30 min, marco "estamos construyendo
software especializado en psicología para clínicas colombianas, buscamos feedback de 4-5 IPS antes
de terminar de definirlo" — no vender de entrada, investigar primero.

**Guion de entrevista (11 preguntas núcleo):**
1. ¿Cuántos psicólogos/profesionales tiene el equipo hoy?
2. ¿Cómo gestionan la historia clínica hoy? (papel, Excel, otro software — ¿cuál?)
3. ¿Facturan a EPS/ADRES o son mayoritariamente pago particular? **(resuelve si RIPS es bloqueante)**
4. ¿Qué tan doloroso es hoy no tener visibilidad centralizada de ocupación/ingresos por profesional?
5. ¿Cuánto pagan hoy en total por herramientas de gestión (software + Excel + lo que sea)?
6. ¿Quién decide una compra de este tipo — el dueño, un comité, administración?
7. ¿La privacidad/cifrado del audio y la historia es un criterio real de compra, o "bonito pero no decide"?
8. Reacción cruda a la tabla de precios de §1 (mostrar sin anclar expectativas primero).
9. ¿Estarían dispuestos a un piloto pagado de 1-2 meses con precio congelado (trato "fundadoras")?
10. ¿Multi-sede es necesario de entrada, o pueden operar con una sola sede en el sistema por ahora?
11. ¿Los profesionales son planta/salario (la clínica cobra y paga nómina), o independientes que
    deben recibir su propio pago directamente? **(resuelve si el split payment de §3.6 es necesario)**

**Timeline sugerido:** completar las 5 conversaciones en 2-3 semanas desde el primer contacto.
**Salida esperada:** confirmar o ajustar la tabla de §1, decidir si RIPS es gate real, y — si al
menos 1-2 muestran intención real de compra — arrancar el trato "fundadoras" antes de construir
nada más.

---

## 5. Mensajes de venta (adaptados a comprador institucional)

Reusando el posicionamiento ya validado en `docs/history/analisis-mercado-y-plan.md`, pero desde la
perspectiva del dueño de una IPS (no del profesional individual):

- **"Ves tu clínica de un vistazo"** — dashboard de equipo: ocupación, no-shows, ingresos por
  profesional, sin pedirle el Excel a nadie. (Dolor #4 del guion de entrevista.)
- **"Cada acceso a un expediente queda trazado"** — need-to-know + break-the-glass con motivo, se
  vende como gobernanza y protección legal para el dueño, no como feature técnica.
- **"El audio nunca sale de tu servidor"** — mismo mensaje que a individuales, pero para un
  comprador institucional pesa más: es un argumento defendible ante pacientes y ante auditoría.
- **No prometer RIPS todavía** — si el prospecto lo necesita de entrada (pregunta 3), ser honesto:
  "no lo tenemos aún, está en el roadmap" en vez de forzar el cierre y quemar la relación.

---

## 6. Checklist de próximos pasos

- [ ] Ejecutar las 5 entrevistas de §4 (2-3 semanas)
- [ ] Con el feedback: confirmar/ajustar tabla de precios de §1
- [ ] Decidir si RIPS pasa a ser prioridad inmediata o se mantiene post-1.0 (depende de §4.3)
- [ ] Implementar precio por tramo en checkout (§3.1) — solo después de validar
- [ ] Preparar plantilla de contrato + DPA formal para firma (§3.4)
- [ ] Resolver con contador/asesor el tema de factura electrónica DIAN (§3.3)
- [ ] Publicar la tabla de precios de Clínica en `chapni.com` (nueva sección, hoy solo hay precio individual)
- [ ] Si al menos 1-2 prospectos son modelo descentralizado (pregunta 11) → dimensionar en serio el split payment de §3.6
- [ ] Si hay demanda real de sitio propio con dominio (§3.7) → primero UI de branding self-service, luego el add-on con costo
- [ ] Si 1-2 prospectos muestran intención real → ofrecer trato "fundadoras" y cerrar el primer piloto pagado
