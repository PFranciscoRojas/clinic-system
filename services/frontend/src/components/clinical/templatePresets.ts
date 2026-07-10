import { RecordType } from '../../api/clinicalRecords';

/**
 * Standard Chapni record formats, offered as one-click presets in
 * Configuración → Formatos de registro. The markdown is parsed server-side
 * on creation, producing a normal org-owned template — presets are only a
 * starting point, the org can edit them afterwards.
 */
export interface TemplatePreset {
  name: string;
  recordType: RecordType;
  description: string;
  markdown: string;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    name: 'Apertura de Historia Clínica',
    recordType: 'INITIAL',
    description: 'Primera sesión: motivo de consulta, historia de vida, antecedentes, examen mental y formulación.',
    markdown: `# Apertura de Historia Clínica

## Reporte textual {text} {required}
"En sus propias palabras, ¿qué lo trae a consulta?"

## Análisis clínico del motivo de consulta {text} {required}
¿Cuál es el problema principal actual? Frecuencia, intensidad y duración de los síntomas.

## Nivel de malestar subjetivo {widget:distress_scale}

## Historia familiar y dinámica de crianza {text}
¿Cómo fue la relación con sus padres/cuidadores en la infancia?

## Historia académica y laboral {text}
¿Cómo ha sido su rendimiento y adaptación escolar/universitaria?

## Historia relacional, social y red de apoyo {text}
¿Cómo son sus relaciones interpersonales actuales?

## Antecedentes médicos y orgánicos {text}
Antecedentes médicos u orgánicos relevantes.

## Antecedentes psicológicos previos {text}
Atenciones psicológicas anteriores.

## Antecedentes psiquiátricos previos {text}
Atenciones psiquiátricas anteriores.

## Antecedentes farmacológicos {text}
Medicamentos actuales y dosis.

## Historia SPA y salud mental familiar {widget:spa_history}

## Formulación clínica 5 factores {widget:formulation_5f}

## Examen mental {widget:mental_exam}

## Impresión diagnóstica o hipótesis clínica provisional {text}
Basado en criterios DSM-5/CIE-11 o análisis funcional.

## Nivel de riesgo {widget:risk}`,
  },
  {
    name: 'Plan Terapéutico',
    recordType: 'EVOLUTION',
    description: 'Segunda sesión: análisis funcional, objetivos consensuados, técnicas e indicadores de logro.',
    markdown: `# Plan Terapéutico

## Estado actual y retoma del motivo de consulta {text} {required}
¿Cómo estuvo el consultante durante la semana? Retomar el motivo de consulta y conducta problema.

## Análisis funcional de la conducta {widget:functional_analysis}

## Objetivo terapéutico 1 {text}
Objetivo concreto, observable y medible.

## Objetivo terapéutico 2 {text}
Dejar en blanco si no aplica.

## Objetivo terapéutico 3 {text}
Dejar en blanco si no aplica.

## Objetivo terapéutico 4 {text}
Dejar en blanco si no aplica.

## Hipótesis y devolución clínica {text}
¿Cómo se le explicó al consultante el funcionamiento de su caso en lenguaje no técnico?

## Indicadores de logro y bienestar {checklist}
¿Cómo sabremos que el proceso está funcionando?

## Técnicas y enfoque a utilizar {checklist}
Ej: Reestructuración Cognitiva, Activación Conductual, Exposición Gradual, Mindfulness.

## Tareas para casa {widget:task_checklist} {collapsed}

## Nivel de riesgo {widget:risk}`,
  },
  {
    name: 'Nota de Evolución',
    recordType: 'EVOLUTION',
    description: 'Sesiones de seguimiento: estado actual, adherencia a tareas, intervención y cierre de sesión.',
    markdown: `# Nota de Evolución

## Nivel de malestar subjetivo {widget:distress_scale}

## Estado actual y reporte subjetivo {text} {required}
¿Cómo llega el consultante? ¿Qué eventos significativos ocurrieron en la semana?

## Seguimiento a compromisos — actividades {widget:task_adherence}

## Descripción clínica de la sesión {text}
Qué temas se abordaron, qué técnicas específicas se aplicaron en vivo.

## Evaluación del cierre de sesión {widget:session_evaluation}

## Nuevas tareas asignadas {widget:task_checklist} {collapsed}

## Nivel de riesgo {widget:risk}`,
  },
  {
    name: 'Informe de Cierre',
    recordType: 'DISCHARGE',
    description: 'Cierre del proceso: logros terapéuticos, estado funcional y plan preventivo.',
    markdown: `# Informe de Cierre

## Resumen del motivo de consulta inicial {text} {required}
Síntesis del motivo de consulta con el que inició el proceso.

## Evaluación de logros terapéuticos y evolución {text} {required}
¿Qué cambios significativos se lograron? ¿Qué herramientas consolidó el consultante?

## Estado funcional al cierre {widget:functionality}

## Recomendaciones y plan preventivo {text}
¿Señales de alerta tempranas? ¿Cuándo reconsultar?

## Nivel de riesgo {widget:risk}`,
  },
];
