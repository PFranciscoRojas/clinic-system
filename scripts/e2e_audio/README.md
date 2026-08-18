# Prueba E2E: grabación de sesión de 1 hora → borrador IA con formato custom

Valida en producción (org demo) el pipeline completo: upload de audio largo →
Whisper → anonimización → Claude con template custom → prellenado de widgets.
Ejecutada por primera vez el 2026-07-11; encontró y motivó los fixes de
PR #178 (read deadline del upload), #179 (timeout de contexto) y
#180 (heurístico de alucinación + mount rw del volumen de audio).

## Resultados de referencia (VPS Hetzner, 2026-07-11)

- Audio: 57,7 min / 61 MB (webm opus 128k, ~10.300 palabras).
- Upload throttled a 500 KB/s: aceptado en ~2 min (antes moría a los 15 s).
- Whisper `base` CPU: transcripción en 8 m 39 s (RTF ≈ 0,15), ~59.000 chars.
- Claude: draft con los 7 campos del template en ~28 s.
- Todos los widgets prellenados con shape válido; audio borrado del disco.

## Procedimiento

1. **Generar audio** (requiere binario piper + voz `es_ES-davefx-medium`):

   ```bash
   python3 gen_session.py > script.txt   # ~10.300 palabras, frases únicas
   sed 's/^Paciente: //; s/^Terapeuta: //' script.txt | \
     piper --model es_ES-davefx-medium.onnx --output_file session60.wav
   ffmpeg -i session60.wav -c:a libopus -b:a 128k session60.webm
   ```

   Las frases del guion son únicas a propósito: el guard anti-alucinación de
   Whisper descarta transcripciones dominadas por frases repetidas.

2. **Usuario efímero en la org demo** (`a0000000-…-01`): INSERT en `users`
   (password con `crypt()`), `professional_profiles`, `user_roles`
   (CLINIC_ADMIN + PROFESSIONAL), y luego `docker compose exec -T core-api ./rehash`.

3. **Template custom**: clonar por SQL un template real (`clinical_record_templates`)
   hacia la org demo. `verify_draft.py` asume el schema de la
   "Nota de Evolución" de marcela-chapues (7 campos, 5 widgets).

4. **Paciente + cita** vía API (`POST /patients`, `POST /appointments`), y upload:

   ```bash
   curl --limit-rate 500k -X POST "$BASE/api/v1/appointments/$APPT/audio" \
     -H "Authorization: Bearer $TOKEN" \
     -F "audio=@session60.webm;type=audio/webm" \
     -F "patient_id=$PATIENT" -F "record_type=EVOLUTION" -F "template_id=$TPL"
   ```

   `--limit-rate 500k` simula el uplink lento de un consultorio (~2 min de
   transferencia) y ejercita los deadlines extendidos del upload.

5. **Verificar** cuando el draft esté `DRAFT_READY` (~10 min):

   ```bash
   python3 verify_draft.py <draft_id> <token>
   ```

6. **Limpieza**: `POST /api/v1/admin/reset-clinical-data` con
   `{"confirmation":"ELIMINAR"}` (solo borra orgs `is_internal`), y DELETE por
   SQL del template clonado y del usuario efímero (notifications, user_roles,
   professional_profiles, users).

## Advertencia

El worker de IA es secuencial: mientras transcribe 1 h de audio (~9 min), los
jobs de otras orgs esperan en cola. Correr la prueba fuera de horario de uso.

---

# Prueba de carga: N sesiones grabando y cerrando a la vez

`load_sessions.py` mide lo único que se nota desde fuera: los segundos entre
pulsar "Finalizar" y tener un borrador. Sube por el mismo camino que el grabador
(una parte por minuto, `/audio/parts`, `/audio/complete`) en vez de mandar la
toma entera, así que ejercita las ventanas de la Fase 4.

Solo biblioteca estándar. La primera versión vivía fuera del repo y hubo que
reconstruirla entera cuando se borró el directorio temporal donde estaba.

## Correrla

```bash
LOAD_PASSWORD='...' python3 load_sessions.py \
    --sessions 3 --pace 3 --parts-dir ./parts --email tu-usuario@demo.clinica.co
```

`--pace 3` es deliberado: una parte llega de verdad una vez por minuto, lo que
le da a cada ventana cinco minutos para hacer ~35 s de trabajo. A 3x le quedan
100 s para lo mismo. Lo que aguanta ahí, sobra en producción.

Las partes salen de una grabación real (`<upload_id>.<n>.chunk`, tal cual las
manda el navegador). Si no tienes, `--source session.webm` corta una toma
terminada por tamaño; sirve para medir tiempos, no para juzgar la calidad del
texto, porque los cortes no caen donde MediaRecorder los pondría.

La cuenta tiene que ser de una organización `is_internal`, porque `--reset`
termina llamando a `/admin/reset-clinical-data`, que se niega con cualquier otra.

## Qué mirar mientras corre

```bash
ssh root@$VPS 'docker logs sghcp_ai_service --since 20m 2>&1 | grep -aE \
  "window transcribed|window stored|absorbing|waited for the window"'
```

Y al terminar, que no quede nada colgando:

```sql
SELECT count(*) FROM partial_transcripts;              -- 0
SELECT status, transcribe_ms, transcribed_seconds, audio_seconds, round(rtf,4)
  FROM ai_drafts ORDER BY created_at DESC LIMIT 5;     -- transcribed_seconds = la cola
```

## Resultados de referencia

Ver §3.4.1 de `docs/ai/PLAN_LATENCIA_AUDIO.md`.
