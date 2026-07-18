/**
 * templateExamples — starter templates for the record-template gallery.
 *
 * Adapted from the reference clinical formats in docs/formatos/ (FORMATO 1-4)
 * to the generic template field types plus the four supported widgets.
 * Identification data (name, ID, contacts) is intentionally absent: the
 * patient record already holds it. discharge_reason is also absent: the
 * discharge form captures it in its own system card outside the template.
 *
 * These are plain markdown strings; picking one runs it through
 * POST /record-templates/parse and preloads the visual builder, fully
 * editable before saving.
 */

import type { RecordType } from '../api/clinicalRecords';

export interface TemplateExample {
  title: string;
  description: string;
  record_type: RecordType;
  markdown: string;
}

export const TEMPLATE_EXAMPLES: TemplateExample[] = [
  {
    title: 'Sesión inicial (apertura)',
    description: 'Motivo de consulta, historia de vida, antecedentes, examen mental e hipótesis clínica.',
    record_type: 'INITIAL',
    markdown: `## Motivo de consulta {text} {required}
Reporte textual del consultante y análisis clínico: problema principal, frecuencia, intensidad, detonantes y áreas afectadas.

## Nivel de malestar subjetivo {scale:1-10}

## Historia familiar y dinámica de crianza {text}
Relación con cuidadores, estilo de crianza, eventos traumáticos o pérdidas significativas.

## Historia académica y laboral {text} {collapsed}
Rendimiento y adaptación escolar, estabilidad laboral, relación con figuras de autoridad.

## Historia relacional y red de apoyo {text} {collapsed}
Relaciones interpersonales actuales, amistades cercanas, relaciones de pareja pasadas y presente.

## Antecedentes relevantes {multiselect:Médicos u orgánicos|Psicológicos previos|Psiquiátricos previos|Farmacológicos|Consumo de SPA} {allow_other}
Marca los antecedentes presentes y detalla en la respuesta libre si aplica.

## Antecedentes familiares en salud mental {multiselect:Ansiedad|Depresión|Suicidio|Psicosis} {pills} {allow_other}

## Examen mental {widget:mental_exam}

## Riesgo {widget:risk}

## Impresión diagnóstica {widget:diagnoses}

## Hipótesis clínica provisional {text}
Formulación inicial del caso: predisposición, adquisición, desencadenantes, mantenimiento y factores protectores.
`,
  },
  {
    title: 'Plan terapéutico y devolución',
    description: 'Análisis funcional, objetivos consensuados, enfoque, técnicas y tareas.',
    record_type: 'INITIAL',
    markdown: `## Análisis funcional de la conducta objeto {text} {required}
Antecedentes, conducta problema y consecuentes que la mantienen.

## Objetivos terapéuticos consensuados {checklist} {required}
Un objetivo por ítem, en términos observables y alcanzables.

## Hipótesis y devolución clínica {text}
Psicoeducación entregada al consultante sobre su funcionamiento.

## Indicadores de logro y bienestar {checklist}
Señales concretas de que el proceso avanza.

## Enfoque y técnicas a utilizar {multiselect:Área cognitiva|Regulación emocional|Aceptación y mindfulness|Activación conductual|Solución de problemas|Interpersonal y autocuidado} {pills} {allow_other}

## Plan de tratamiento {widget:treatment_plan}

## Tareas para casa {checklist}

## Riesgo {widget:risk}
`,
  },
  {
    title: 'Nota de evolución y seguimiento',
    description: 'Estado actual, adherencia a compromisos, intervención de la sesión y nuevos compromisos.',
    record_type: 'EVOLUTION',
    markdown: `## Estado actual y reporte subjetivo {text} {required}
Cómo llega el consultante y qué refiere desde la última sesión.

## Nivel de malestar subjetivo {scale:1-10}

## Adherencia a compromisos {select:Completa|Parcial|Nula} {pills}

## Seguimiento a compromisos {text}
Qué actividades realizó, obstáculos encontrados y aprendizajes.

## Intervención realizada en la sesión {text} {required}
Técnicas aplicadas, proceso trabajado y respuesta del consultante.

## Evaluación del cierre de sesión {select:Avance significativo|Avance leve|Sin cambios|Retroceso} {pills}

## Nuevos compromisos extra-consulta {checklist}

## Riesgo {widget:risk}
`,
  },
  {
    title: 'Informe de cierre (epicrisis)',
    description: 'Resumen del proceso, logros terapéuticos, estado final y plan preventivo.',
    record_type: 'DISCHARGE',
    markdown: `## Resumen del motivo de consulta inicial {text} {required}
Por qué inició el proceso y cuál era el estado del consultante al llegar.

## Evaluación de logros terapéuticos {text} {required}
Comparación del estado inicial frente al final, objetivo por objetivo.

## Estado clínico actual al cierre {text}
Sintomatología presente, funcionamiento en áreas de ajuste y recursos consolidados.

## Nivel de malestar al cierre {scale:1-10}

## Recomendaciones y plan preventivo {checklist}
Pautas de autocuidado y señales de alerta para retomar el proceso.

## Riesgo {widget:risk}
`,
  },
];
