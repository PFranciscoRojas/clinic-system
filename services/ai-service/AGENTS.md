# ai-service (Python)

Worker que transcribe el audio de las sesiones con Whisper local y redacta borradores y sugerencias
clínicas con un LLM. Consume trabajos de Redis Streams que publica core-api. Las reglas generales
están en el `AGENTS.md` de la raíz; la que más pesa aquí es la 5.

## Cómo está organizado

| Qué | Dónde |
|---|---|
| Configuración (modelo del LLM, Whisper, hilos, ventanas) | `src/ai_service/config.py` |
| Bucle del worker, carriles y colas | `src/ai_service/worker.py` |
| Transcripción con faster-whisper | `src/ai_service/transcription/` |
| Anonimización antes del LLM (spaCy + reglas) | `src/ai_service/anonymization/` |
| Defensa contra instrucciones dentro de la transcripción | `src/ai_service/prompt_guard.py` |
| Borradores clínicos y sugerencias | `src/ai_service/drafts/`, `src/ai_service/suggestions/` |
| Prompts por enfoque terapéutico | `src/ai_service/approaches.py` |
| Descifrado de DEKs (misma `MASTER_KEY` que core-api) | `src/ai_service/crypto.py` |

## Reglas

- **El audio nunca sale del servidor.** Whisper corre en el contenedor. No se añade ningún servicio
  externo de transcripción, ni como respaldo.
- **El LLM solo ve texto anonimizado.** Todo texto pasa por `src/ai_service/anonymization/` antes de cualquier
  llamada. `tests/test_anonymization.py` es la forma ejecutable de esta regla.
- **El modelo del LLM no se cambia a ciegas.** Se configura en `src/ai_service/config.py` (sobrescribible por
  entorno). Antes de cambiarlo se comparan los dos modelos sobre transcripciones anonimizadas y con
  las métricas de `draft_feedback`; un borrador clínico peor no se nota en ningún test.
- **Los borradores son inmutables.** El servicio escribe un borrador nuevo; nunca edita uno que ya
  existe. El profesional es quien aprueba.
- La latencia y las ventanas de transcripción están documentadas en
  `docs/ai/PLAN_LATENCIA_AUDIO.md` (raíz del repo), que también citan el código y los tests.

## Tests

```
PYTHONPATH=src .venv/bin/python -m pytest -q
```

`tests/conftest.py` reemplaza faster-whisper por un stub, así que no hace falta descargar pesos. Las
dependencias mínimas de test están anotadas en `scripts/verify.sh` de la raíz.

## Deploy

A diferencia de core-api, este servicio se despliega al mergear a `main` (ver
`docs/ops/DEPLOY.md` en la raíz).
