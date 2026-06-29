# Plan: Módulo de Evaluaciones Psicológicas (MBC)

> Pendiente de validación con beta testers antes de implementar.
> Pregunta clave para validar: *"¿Enviarías un cuestionario de 2 min a tus pacientes antes de cada sesión y verías una gráfica de su progreso?"*
> Fecha de análisis: 2026-06-28

---

## Veredicto

**Sí vale la pena — vacío de mercado real en Colombia.** Ningún software local tiene Measurement-Based Care (MBC) con gráficas de progreso como SimplePractice o CarePaths. El núcleo funcional (7 pruebas más relevantes) es de dominio público: costo de licencias $0.

---

## Benchmark de competidores

| Sistema | Pruebas gratuitas | Gráficas | Alertas | Precio |
|---|---|---|---|---|
| SimplePractice | PHQ-9, GAD-7, PCL-5, OCI-R | ✅ Línea temporal + baseline | ✅ Flag rojo ítem 9 PHQ-9 | $49/mes |
| TherapyNotes | PHQ-9, GAD-7, PCL-5, ACE, CAGE-AID + 8 más | ✅ Tab "Insights" coloreado | ✅ | incluido |
| CarePaths | PHQ-9, GAD-7, OQ-45, PCL-5 + 15 más | ✅ Arriba de la ficha del paciente | ✅ Configurables | $49/mes |
| Osmind | PHQ-9, GAD-7, C-SSRS, DSM-5-TR L1 + 50 | ✅ | ✅ Por umbral | $199/mes |
| Psiris (Colombia) | ❌ | ❌ | ❌ | $59.900 COP/mes |
| Assessment Mind (Colombia) | 32 pruebas | No claro | No documentado | $99.000 COP/mes |

---

## Pruebas de dominio público — costo $0

| Prueba | Mide | Ítems | Tiempo | Validación Colombia |
|---|---|---|---|---|
| **PHQ-9** | Depresión | 9 | 2 min | ✅ AUC=0.92, n=1.413 |
| **GAD-7** | Ansiedad | 7 | 2 min | ✅ n=2.278 universitarios |
| **PCL-5** | PTSD | 20 | 5 min | No específica pero ampliamente usada |
| **AUDIT** | Alcohol | 10 | 3 min | OMS — universal |
| **DASS-21** | Depresión+Ansiedad+Estrés | 21 | 5 min | Presente en investigación colombiana |
| **HAM-A** | Ansiedad clínico | 14 | — | Dominio público |
| **ACE** | Trauma infantil | 10 | 3 min | CDC — universal |

Todos: reproducir, traducir y distribuir libremente. PHQ-9 y GAD-7: Pfizer liberó copyright en 2010.

## Pruebas propietarias relevantes en Colombia

| Prueba | Propietario distribuidor | Uso en Colombia | Para integrar |
|---|---|---|---|
| BDI-II | Pearson / Impact-psy | Muy frecuente en academia | Largo plazo |
| SCL-90-R | Pearson / Impact-psy | Validada en muestra clínica colombiana | Mediano plazo |
| MMPI-2 | Pearson / U. Minnesota | Forense/laboral principalmente | No prioritario |

**Ninguna casa editorial tiene API pública.** Hogrefe (representado en Colombia por PSEA Consultores — pseaconsultores.com) es la más abierta técnicamente (HTS 5 mencionado para integración con terceros). Requiere acuerdo comercial.

---

## ¿Los psicólogos colombianos las usan?

- 150.000+ psicólogos con tarjeta profesional; campo clínico = segundo más grande
- En consulta privada: uso mayoritariamente en papel y sin tracking longitudinal
- Barrera real: administración manual consume 15–30 min adicionales por sesión
- Si SGHCP elimina la fricción (envío automático + scoring + gráfica), el comportamiento cambia

**Argumento de ventas:** *"¿Cómo le demuestras a tu paciente que está mejorando?"* Una gráfica de PHQ-9 bajando de 18 a 7 en 8 semanas es irrefutable.

**Evidencia de impacto:** 74% de remisión con MBC vs 29% sin él. Reducción de abandono terapéutico.

---

## Por qué las pruebas de pago son "mejores" (y cuándo no lo son)

| Contexto | Pruebas libres | Pruebas propietarias |
|---|---|---|
| Seguimiento semanal (MBC) | ✅ Perfectas — cortas, rápidas | ❌ Muy largas |
| Diagnóstico diferencial profundo | ⚠️ Limitadas | ✅ Superiores |
| Perfiles de personalidad | ❌ | ✅ MMPI-2, MCMI-III |
| Neuropsicología | ❌ | ✅ WAIS-IV |
| Informe pericial | ❌ | ✅ Requeridos |
| Costo de implementación | $0 | Alto |

Son complementarias: las libres para MBC semanal; las propietarias para evaluación diagnóstica inicial profunda.

---

## Cómo se ven las gráficas (patrón de todos los sistemas maduros)

- **Eje X:** fechas de administración
- **Eje Y:** score total
- **Líneas horizontales de corte** por severidad con colores (verde/amarillo/naranja/rojo)
- **Delta** vs sesión anterior y vs baseline
- **Click en punto** → ver respuestas individuales
- **Alerta visual** cuando ítem de suicidalidad (PHQ-9 ítem 9) > 0
- **Automatización:** el sistema envía el cuestionario X horas antes de la cita → paciente completa en portal → score aparece antes de la sesión

---

## Plan de implementación por fases

### Fase 1 — MBC básico (2–3 semanas) · VALIDAR PRIMERO

**Pruebas:** PHQ-9, GAD-7, PCL-5

**Migración 000047:**
```sql
assessment_templates   -- catálogo (name, slug, items JSONB, scoring_rules JSONB)
patient_assessments    -- administraciones (patient_id, template_id, responses BYTEA[AEA], score INT)
assessment_schedules   -- envío automático (patient_id, template_slug, frequency_days)
```

**Scoring rules en JSONB** (sin migrations para agregar pruebas nuevas):
```json
{
  "total": "sum_all",
  "cutoffs": [
    {"max": 4,  "label": "Mínimo",         "color": "#10b981"},
    {"max": 9,  "label": "Leve",            "color": "#84cc16"},
    {"max": 14, "label": "Moderado",        "color": "#f59e0b"},
    {"max": 19, "label": "Moderado-severo", "color": "#f97316"},
    {"max": 27, "label": "Severo",          "color": "#ef4444"}
  ],
  "alerts": [
    {"item": 8, "condition": "gt", "value": 0, "message": "Ítem de suicidalidad positivo — evaluar riesgo en sesión"}
  ]
}
```

**Endpoints:**
```
GET  /assessments/templates
POST /patients/{id}/assessments          ← enviar link al paciente
GET  /patients/{id}/assessments          ← historial + scores
GET  /assess/:token (público)            ← paciente completa sin login
POST /assess/:token                      ← paciente envía respuestas
```

**Frontend:**
```
pages/Patients/ → pestaña "Evaluaciones" con AssessmentChart (recharts, ya instalado)
pages/Public/AssessmentPage.tsx          ← página pública para el paciente
components/clinical/AssessmentAlertBanner ← si PHQ-9 ítem 9 > 0
```

**Cifrado:** `responses BYTEA[AEA]` con DEK del paciente (igual que SOAP). Score INT puede ir plano o cifrado según criterio de privacidad.

**Flujo:**
1. Psicólogo → "Evaluaciones" en ficha → selecciona PHQ-9 → envía link por email/portal
2. Paciente completa en `/assess/:token` sin login
3. SGHCP calcula score, cifra respuestas, detecta alertas
4. Psicólogo ve gráfica + alerta antes de la próxima sesión

---

### Fase 2 — Automático + más pruebas (mes 2)

- Pruebas: AUDIT, DASS-21, HAM-A, ACE
- Job Redis: N días antes de la cita → envío automático del assessment configurado
- Delta visual: flecha verde/roja puntos de cambio vs sesión anterior
- IA: si PHQ-9 subió, mencionarlo en el borrador SOAP

---

### Fase 3 — Features avanzados (mes 3–4, si hay tracción)

- Múltiples pruebas por sesión (PHQ-9 + GAD-7 juntos)
- Notificación WhatsApp cuando paciente completa (infraestructura Meta Cloud API ya disponible)
- Dashboard agregado: promedio PHQ-9 de todos los pacientes activos
- Exportar scores al PDF clínico del paciente

---

### Fase 4 — Post 1.0

- IA + MBC: "El PHQ-9 ha subido 3 sesiones seguidas — revisar plan terapéutico"
- Pruebas adolescentes: PHQ-A, Spence Children's Anxiety Scale
- Negociar con Hogrefe/PSEA para SCL-90-R y BDI-II

---

## Estimación de esfuerzo y ROI

| Fase | Tiempo | Costo licencias | Impacto |
|---|---|---|---|
| Fase 1 (3 pruebas, envío manual) | 2–3 semanas | $0 | Alto — demostrable en demo |
| Fase 2 (automático + 4 pruebas) | 2 semanas | $0 | Medio — UX |
| Fase 3 (multi-prueba + dashboard) | 2–3 semanas | $0 | Retención |
| Fase 4 (IA+MBC + propietarias) | 4+ semanas + negociación | Variable | Diferenciación profunda |

**Argumento de precio:** Con este módulo, SGHCP justifica $250.000–$350.000 COP/mes. El psicólogo con 30+ pacientes activos paga ~$8.000 COP/paciente/mes por un sistema que le ahorra 2h/semana y le da datos que ningún competidor local le da.

---

## Validación requerida antes de implementar

Preguntar a las psicólogas beta:
1. "¿Usas actualmente alguna prueba estandarizada con tus pacientes? ¿Cuáles?"
2. "¿Estarías dispuesta a enviarle un cuestionario de 2 min a tus pacientes antes de cada sesión?"
3. "¿Tus pacientes tienen smartphone y correo electrónico?"
4. "¿Qué harías si ves que el PHQ-9 de un paciente subió 6 puntos esta semana?"

Si 2 de 3 dicen sí a la pregunta 2 → implementar Fase 1.

---

## Fuentes consultadas (2026-06-28)

- SimplePractice MBC: simplepractice.com/features/measurement-based-care/
- TherapyNotes Outcome Measures: therapynotes.com/features/outcome-measures/
- CarePaths MBC + Pricing: carepaths.com/products/measurement-based-care-for-mental-health/
- PCL-5: ptsd.va.gov/professional/assessment/adult-sr/ptsd-checklist.asp
- PHQ-9 validación Colombia: Revista Colombiana de Psiquiatría (Elsevier)
- GAD-7 validación LatAm: Sage Journals doi:10.1177/24705470251315260
- Colpsic caracterización sociodemográfica 2025: colpsic.org.co
- Resolución 1888/2025 Minsalud: minsalud.gov.co
- Assessment Mind Colombia: assessmentmind.com
- Psiris Colombia: psiris.co
