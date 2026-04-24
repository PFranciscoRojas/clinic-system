# ADR-004: Arquitectura del Microservicio de IA (Copiloto Clínico)

- **Estado:** Aceptado
- **Fecha:** 2026-04-23
- **Autores:** Equipo de Arquitectura

## Contexto

El módulo de IA debe recibir una grabación de audio de la sesión clínica, transcribirla y extraer de forma estructurada la información clínica (motivo de consulta, evolución, plan terapéutico). La **regla de oro** del RFC: la IA produce un borrador; la profesional siempre revisa, edita y aprueba para que quede en el registro oficial. Este módulo maneja el dato más sensible del sistema — el audio de una sesión de psicología — y debe estar diseñado con privacidad como principio central (Privacy by Design, ISO 29101).

## Decisión

**Python 3.12 + FastAPI** como microservicio independiente, comunicado con el `core-api` vía HTTP interno (no expuesto públicamente). El flujo de procesamiento es asíncrono mediante una cola de trabajo.

## Flujo Completo

```
Profesional sube audio
        │
        ▼
[core-api (Go)]
  1. Valida JWT y permisos
  2. Recibe audio (multipart/form-data)
  3. Almacena audio cifrado en S3 (ruta cifrada en BD)
  4. Crea registro ai_draft con status=PENDING
  5. Publica evento en cola (SQS / Redis Streams)
        │
        ▼
[ai-service (Python/FastAPI) — worker]
  6. Consume evento de la cola
  7. Descarga audio de S3 (URL presignada temporal)
  8. Transcripción: Whisper (local, open-source) ← audio nunca sale a terceros
  9. Extracción estructurada: LLM (Claude API con prompt engineering)
 10. Almacena borrador cifrado en BD → status=DRAFT_READY
 11. Notifica a core-api (webhook interno)
        │
        ▼
[Profesional recibe notificación en UI]
 12. Revisa borrador en la interfaz
 13. Edita los campos que necesite
 14. Aprueba explícitamente → status=APPROVED
 15. core-api persiste la historia clínica oficial y elimina el borrador
```

## Decisiones de diseño clave

### Transcripción: Whisper local (open-source)

- **Por qué local:** El audio de una sesión de psicología es el dato más sensible del sistema. Enviarlo a una API externa de terceros (AssemblyAI, Deepgram, Google Speech) implica transferencia de datos fuera del control del responsable. Whisper de OpenAI puede ejecutarse localmente sin costo por transacción.
- **Modelo recomendado:** `whisper-large-v3` para español — 98%+ WER en español latinoamericano.
- **Hardware:** Una instancia con GPU (AWS `g4dn.xlarge` ~USD 0.53/hr) o CPU en instancias `c6i.xlarge` con tiempo de procesamiento ~3x real-time.
- **Alternativa aceptable:** Si el costo de GPU es prohibitivo en etapa inicial, usar `whisper-medium` en CPU aceptando ~8 min de procesamiento por hora de audio.

### LLM para extracción estructurada: Claude API (Anthropic)

- **Por qué Claude:** El prompt de extracción clínica requiere razonamiento de alta calidad, seguimiento de instrucciones complejas y output estructurado (JSON). Claude 3.5 Sonnet tiene las mejores capacidades en estas dimensiones.
- **Dato que se envía a Claude:** Solo la **transcripción de texto**, no el audio. La transcripción no contiene nombre del paciente ni datos identificadores — el prompt siempre opera sobre texto anonimizado.
- **Anonimización pre-LLM:** El worker reemplaza nombres propios detectados (NER simple con spaCy) con placeholders como `[PACIENTE]`, `[FAMILIAR]` antes de enviar al LLM.
- **Output esperado:**
  ```json
  {
    "motivo_consulta": "...",
    "evolucion": "...",
    "evaluacion": "...",
    "plan": "...",
    "observaciones": "..."
  }
  ```
- **Prompt engineering:** El prompt incluye instrucciones de formato SOAP (Subjetivo, Objetivo, Análisis, Plan) adaptadas al contexto de psicología.

### Inmutabilidad del borrador

- El borrador (`ai_draft`) tiene un campo `draft_content` (cifrado AEA).
- El borrador es **de solo lectura** una vez generado. La profesional edita en un formulario separado que crea el registro oficial.
- El sistema nunca sobrescribe el registro oficial con el borrador directamente — hay una acción de aprobación explícita con firma de la sesión JWT.
- Los borradores se eliminan automáticamente 30 días después de su aprobación o rechazo (política de retención mínima).

### Consentimiento previo obligatorio

- El flujo de subida de audio solo está disponible si existe un registro de consentimiento firmado del paciente para la grabación.
- El `core-api` valida este consentimiento antes de aceptar el audio.

## Alternativas descartadas

| Opción | Por qué se descartó |
|---|---|
| AssemblyAI / Deepgram para transcripción | Audio sale a terceros en EE.UU. — violación de principios de privacidad y posible infracción Ley 1581 Art. 26 |
| Procesar audio sincrónicamente en el request | El procesamiento puede durar 5-15 min — inaceptable para un endpoint HTTP |
| GPT-4o para extracción | Dato enviado a OpenAI (EE.UU.) sin garantías equivalentes de privacidad médica para Colombia |
| Integrar IA directamente en core-api (Go) | Go no tiene ecosistema de ML maduro; la separación permite escalar y actualizar los modelos independientemente |

## Consecuencias

- **Positivas:** Audio nunca sale de la infraestructura propia; borrador siempre requiere aprobación humana; microservicio independiente permite actualizar modelos sin tocar el core.
- **Negativas:** Requiere GPU o tiempo de procesamiento considerable; la cola añade complejidad operacional.
- **Mitigación:** Comenzar con CPU en etapa beta para controlar costos; añadir GPU al alcanzar carga de producción.

## Stack técnico del microservicio

| Propósito | Tecnología |
|---|---|
| Framework API | FastAPI 0.115+ |
| Transcripción | `openai-whisper` (local) |
| NER / Anonimización | `spaCy` (modelo `es_core_news_lg`) |
| LLM | Anthropic Claude API (`claude-sonnet-4-6`) |
| Cola de mensajes | Redis Streams (Bootstrap y dev) → AWS SQS (Cloud) |
| Almacenamiento temporal | `/data/audio/` en el host (Bootstrap) → AWS S3 pre-signed URLs (Cloud) |
| Containerización | Docker con modelo Whisper pre-descargado en imagen |
