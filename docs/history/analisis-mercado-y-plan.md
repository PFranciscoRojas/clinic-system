# Análisis de mercado y plan de priorización — SGHCP (clinic-system)

**Fecha:** 2026-06-15 · **Autor del análisis:** Claude (Opus 4.8), con investigación de mercado en vivo
**Input:** `sugerencias.md` (charla con Claude web) + contexto del producto actual

> Resumen de una línea: como **scribe de IA** esto **no es una empresa**; como **sistema clínico
> psychology-native para el mundo hispano con privacidad verificable y cumplimiento colombiano**,
> **sí es un negocio real** — bootstrapeable, de nicho, no de capital de riesgo. Lo que falta para
> venderlo **no es más IA: es la capa de producto** (multi-tenant + cobro + onboarding solo).

---

## 1. La realidad del mercado (datos, no opinión)

### El scribe ya es commodity — competir ahí de frente es perder
- El mercado de **AI medical scribe cruzó USD 1.5 B en 2025**, crece ~25 %/año, con **+100 empresas
  financiadas** y **2 jugadores controlando ~2/3** del mercado. Está **consolidándose y
  comoditizándose**: el precio ya es el diferenciador.
- Carrera al piso en precio: **Upheal** pasó a **USD 1/sesión, tope USD 69/mes** + plan gratis;
  **Mentalyc** USD 20–70/mes; **Freed** ya tiene **20.000 clínicos** y "competencia subiendo rápido".
- Traducción: si tu propuesta es "grabo y genero la nota", peleas contra productos gratis,
  financiados con venture, en inglés, con años de ventaja. **Inviable** como empresa independiente.

### Dónde sí hay negocio: la capa que tú YA tienes y ellos no
- Los scribes puros (Mentalyc, Freed) **no tienen la historia clínica completa cifrada**. Tú sí.
- **Blueprint** levantó **+USD 14 M** no por el scribe, sino por **medición de resultados + dataset
  propietario** sobre el historial. El valor está en *qué haces con los datos después de la nota*.
- Tu activo defendible = **historia clínica cifrada + plan terapéutico + privacidad real (Whisper
  local) + cumplimiento legal colombiano**. Eso es un *vertical SaaS*, no un scribe.

### Corrección honesta al chat de Claude web: el "hueco en español" está exagerado
El doc dice "casi nadie lo hace bien en español". **Falso a medias** — ya hay jugadores hispanos:
- **SaludTools (Colombia)**: **7.000 médicos**, su plan Premium (**$168.000 COP ≈ USD 40/mes**) ya
  incluye **historia clínica que se llena con voz (IA) + triage por WhatsApp + RIPS + facturación**.
  Es tu competidor más peligroso: tiene **distribución y cumplimiento colombiano ya resueltos**.
- **España**: **Aimentia Health** (graba+transcribe+detecta patrones), **PsaicoTools** (notas de
  sesión IA), **TerapIA/Pía** (entrenada con psicólogos clínicos, RGPD nativo), y opciones a 22 €/mes.

**Conclusión del hueco real:** no es "español". Es la intersección estrecha de
**(psychology-native a profundidad) × (privacidad verificable: el audio nunca sale del servidor) ×
(cumplimiento colombiano hecho bien: Res. 1995/1999, Ley 1581, RIPS/DIAN)**. SaludTools es
*generalista médico*; tú puedes ser *el especialista de psicología*. Esa es la cuña.

### Tamaño del campo de juego
- **Colombia**: Colpsic ha emitido **+150.000 tarjetas** (acumulado desde 2006), promedio
  **~18.000/año** nuevos. Mercado primario real, pero fragmentado.
- **LATAM salud digital**: estimada en **USD 11.7 B para 2028, CAGR 33 %**. Telepsicología +300 %
  en una década. Viento de cola fuerte.
- **Realismo financiero**: banda de precio hispana ≈ **USD 20–40/mes por profesional**. Para
  **~USD 5.000/mes** necesitas **~150–250 psicólogos pagando**. Eso es **bootstrap viable**, no
  "unicornio". Hay que decirlo claro.

---

## 2. ¿Es viable como empresa, o la IA la vuelve inviable?

| Escenario | Veredicto |
|---|---|
| Pure AI scribe global (inglés) | ❌ **Inviable.** Commodity, gratis, incumbentes con capital. |
| Pure AI scribe en español | ⚠️ **Marginal.** Ya hay 3–4 jugadores; sin diferenciación mueres por precio. |
| **Vertical SaaS psicología, hispano, Colombia-first, privacidad + cumplimiento + memoria longitudinal** | ✅ **Viable como negocio rentable de nicho.** No venture-scale sin capital, pero sí empresa real. |

**La IA no te vuelve inviable — te vuelve *insuficiente*.** La IA es tu *entrada* (mesa de juego),
no tu *foso*. El foso es: historia cifrada + privacidad demostrable + cumplimiento colombiano +
profundidad psicológica. Eso es lo que un competidor de EE.UU. **nunca** va a construir para Colombia.

**Global / Hispano / LATAM — recomendación:**
- 🌍 **Global: no.** Sin capital ni equipo no compites con Abridge/Freed/Upheal.
- 🇪🇸🇲🇽🇨🇴 **Hispano/LATAM: sí, pero contestado.** Empieza **Colombia-first** (donde el cumplimiento
  es tu ventaja y conoces las reglas) → Andina (Perú, Ecuador, reglas parecidas) → resto hispano.
- El cumplimiento (RIPS, facturación electrónica DIAN, habeas data) es **alto costo de cambio** y
  **barrera que los gringos no cruzan**. Es tu mejor activo de retención, más que cualquier feature IA.

---

## 3. Análisis con criterio — cada punto puntuado

Escala 1–5. **Impacto en ingresos** (¿hace que paguen?) · **Esfuerzo** (1 = caro) · **Foso**
(¿defendible / cuesta replicar?) · **Riesgo**.

### Capa producto/operación (lo que el chat acertó: aquí está el negocio)

| Pieza | Impacto | Esfuerzo | Foso | Veredicto |
|---|---|---|---|---|
| **Backups offsite (B2)** | — (riesgo) | 4 | — | 🔴 **Bloqueante go-live.** Hoy backup vive en el mismo VPS = perder 15 años de historias por una falla de disco. Va **primero**. |
| **Rotar API key + `ALLOW_DATA_RESET=false`** | — (riesgo) | 5 | — | 🔴 **Bloqueante.** Horas de trabajo, riesgo enorme eliminado. |
| **Hardening auth (tokens hash + sesiones)** | — (riesgo) | 5 | bajo | ✅ **HECHO (9b, hoy).** Un comprador serio lo pregunta. |
| **Multi-tenancy** | 5 | 1 | medio | 🟢 **El convertidor en empresa.** Sin esto es un sistema a medida para Marcela, no un producto. Trabajo grande pero **inevitable**. |
| **Cobro / suscripciones (Wompi/MercadoPago/PSE)** | 5 | 3 | bajo | 🟢 **Sin esto no entra plata sola.** Imprescindible para vender al 2º cliente. |
| **Onboarding self-serve + prueba gratis** | 5 | 3 | bajo | 🟢 **Mi añadido.** Si cada alta requiere que tú la hagas a mano, no escala. Es lo que separa "consultoría" de "SaaS". |
| **Infra que aguante + cola de jobs** | 4 | 3 | bajo | 🟡 Un VPS de 2 GB no escala a 50 grabando. Necesario al crecer, no día 1. |

### Capa IA (mesa de juego — necesaria, no suficiente)

| Pieza | Impacto | Esfuerzo | Foso | Veredicto |
|---|---|---|---|---|
| **Formatos de nota (SOAP/DAP/BIRP)** | 2 | 5 | nulo | 🟡 Table stakes, barato. Hazlo cuando toques el draft. |
| **Edición conversacional del borrador** ("más corto", "agrega riesgo") | 3 | 4 | bajo | 🟡 Trivial con Claude, **brilla en demo**. Bueno para ventas. |
| **Plan terapéutico con IA desde sesión 1** | 3 | 3 | medio | 🟡 Upheal lo regala; tú ya guardas el plan. Súmalo al recap. |
| **★ Recap pre-sesión (memoria longitudinal)** | 5 | 4 | **alto** | 🟢 **El feature estrella.** Reusa el historial cifrado que ya tienes. Lo más *sticky* (retención) y dificilísimo de replicar sin la historia. **Primer feature IA a construir.** |
| **★ Detección de riesgo (ideación, autolesión, abuso)** | 5 | 4 | medio | 🟢 Vende por **valor clínico + protección legal**. Casi gratis: la transcripción ya pasa por el pipeline. Regla de oro: **alerta, no diagnostica** (human-in-loop, como ya haces con CIE-10). |
| **Generación de informes/cartas (remisión, EPS, alta)** | 4 | 3 | medio | 🟢 Reusa tu render PDF legal. Ahorro de tiempo **medible** = argumento de venta duro. |
| **"Pregúntale a la historia" (RAG sobre expediente)** | 3 | 2 | medio | 🟡 Potente pero más caro y delicado (permisos+cifrado). Después del recap. |
| **Seguimiento de objetivos del plan** | 3 | 3 | medio | 🟡 Conecta con "medición de resultados" (lo de Blueprint). Bonus, no urgente. |
| **Tareas/psicoeducación post-sesión** | 2 | 4 | bajo | ⚪ Bajo riesgo, valor medio. Backlog. |
| **Analítica de sesión (ratio habla, tono)** | 2 | 2 | bajo | ⚪ Puede sentirse *gimmicky*/invasivo. Solo como auto-supervisión. Tarde. |
| **Predicción de inasistencias** | 2 | 3 | bajo | ⚪ Secundario. |
| **Chatbot/companion para pacientes** | 1 | 1 | — | ⛔ **No tocar.** IA hablando directo a pacientes de salud mental = riesgo legal/reputacional altísimo. Solo con equipo clínico+legal. |

### Mis añadidos (no estaban en el chat — y creo que importan)

| Pieza | Por qué |
|---|---|
| **★ Portal de reserva para pacientes (marcela-chapues ↔ clinic-system)** | Ya lo tienes a medias en tu contexto de integración. Reduce inasistencias y es **canal de adquisición** (cada psicólogo trae sus pacientes). Súbelo de prioridad. |
| **Integración RIPS + facturación electrónica DIAN** | **El foso que ningún gringo cruza.** Alto costo de cambio. SaludTools ya lo tiene — es *paridad obligatoria* para vender a quien factura a EPS. |
| **"Privacidad auditable" como activo de venta** | "Tu audio nunca sale de tu servidor" es real y raro. Pero ⚠️ **no lo sobrevalores**: la mayoría de compradores se conforma con cloud+BAA. Es diferenciador para *un segmento* (datos sensibles, instituciones), no demanda universal. Conviértelo en una página de marca + un PDF de cumplimiento, no en tu única bala. |
| **Recordatorios WhatsApp** | Canal #1 en Colombia, baja inasistencias. SaludTools ya lo tiene → paridad. Argumento de venta fuerte. |
| **Plantillas de nota personalizables** | Ya en tu backlog; los competidores lo venden como diferenciador. Sobre tu base de cumplimiento, no reemplazándola. |

---

## 4. El plan — secuencia priorizada por olas

**Principio rector:** *no construyas más IA hasta que esto sea vendible y no pierda datos.*
La IA ya es competitiva; el cuello de botella es producto/operación.

### 🌊 Ola 0 — Tapar bloqueantes de go-live (días, riesgo enorme eliminado)
1. **Backups offsite B2** (crear cuenta Backblaze — hoy bloqueado por ti).
2. **Rotar `ANTHROPIC_API_KEY`** + **`ALLOW_DATA_RESET=false`**.
3. ✅ Hardening auth — **hecho hoy**.

### 🌊 Ola 1 — Validar con realidad (gratis, decide todo lo demás)
4. **Ronda 8: sesión real de Marcela con contenido clínico hablado.** Te dice qué falla de verdad
   antes de invertir. **Va antes de construir cualquier feature.**

### 🌊 Ola 2 — Volverlo PRODUCTO (el salto a empresa)
5. **Multi-tenancy** (aislamiento por tenant; tu DEK por registro ayuda).
6. **Cobro Wompi/PSE** + planes.
7. **Onboarding self-serve + prueba gratis** (vender sin que tú instales a mano).
8. **Página de marca + demo** (con la edición conversacional como gancho visual).
   → **Hito: vender a los primeros 5–10 psicólogos colombianos pagando.**

### 🌊 Ola 3 — El foso de IA que retiene (solo después de tener multi-tenant + pagos)
9. **★ Recap pre-sesión** (retención — te vuelve indispensable día a día).
10. **★ Detección de riesgo** (adquisición — vende por emoción y por miedo).

### 🌊 Ola 4 — Paridad competitiva + ingresos
11. **WhatsApp recordatorios** · 12. **Generación de informes (EPS/remisión/alta)** ·
13. **Plantillas personalizables** · 14. **Portal de reserva de pacientes** · 15. **Google Calendar**.

### 🌊 Ola 5 — Foso LATAM profundo + features tardías
16. **RIPS + facturación DIAN** (paridad para facturar a EPS, alto costo de cambio).
17. RAG "pregúntale a la historia" · 18. Seguimiento de objetivos · 19. Analítica (auto-supervisión).
⛔ **Nunca sin equipo clínico/legal:** chatbot directo a pacientes.

---

## 5. Mi recomendación de fondo (si tuviera que elegir UNA estrategia)

> **No intentes ganarle a los gringos en IA. Gánales en lo que ellos nunca harán: ser *el* sistema
> de psicología para Colombia/LATAM — profundidad clínica + privacidad demostrable + cumplimiento
> local — y véndelo bootstrapeado, Colombia-first.**

- **Tres mensajes de venta** (atraviesan todo): **"Recuperas tiempo"** (detonante #1), **"Privacidad
  real: tu audio nunca sale de tu servidor"**, **"Pensado para psicólogos, no medicina genérica"**.
- **Regla ética = regla comercial:** la IA sugiere, el humano decide (ya lo haces con el CIE-10).
  Mantenlo en riesgo, informes, recap. Protege legalmente y genera confianza clínica.
- **El orden importa más que la lista:** Ola 0 (no pierdas datos) → Ola 1 (valida) → Ola 2
  (vuélvelo vendible) → recién ahí Ola 3 (recap + riesgo). Construir IA antes de multi-tenant es
  optimizar el motor de un carro sin ruedas.

**Decisión que necesito de ti para arrancar:** ¿el objetivo es **negocio real** (entonces Ola 2 es
la inversión grande y vale la pena) o **seguir afinando para Marcela** (entonces saltamos directo a
recap pre-sesión tras la Ola 0)? De eso depende todo lo demás.

---

## Fuentes
- Upheal pricing — Capterra / upheal.io/pricing
- Mentalyc pricing — Capterra / mentalyc.com
- Blueprint funding (USD 14 M, dataset) — PitchBook / PRNewswire
- SaludTools precios y features IA — saludtools.com/precios
- Comoditización AI scribe (USD 1.5 B, 2/3 dos jugadores, Freed 20k) — Aragon Research / VentureBeat
- Mercado salud digital LATAM (USD 11.7 B 2028, +300 % telepsicología) — Practia / Spherical Insights
- Competidores hispanos (Aimentia, PsaicoTools, TerapIA) — búsqueda directa
- Cifras Colpsic (+150k tarjetas, ~18k/año) — colpsic.org.co
