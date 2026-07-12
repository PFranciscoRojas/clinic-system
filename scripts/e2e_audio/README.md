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
