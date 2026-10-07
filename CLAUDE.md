@AGENTS.md

# Solo para Claude Code

Todo lo del proyecto está en `AGENTS.md`, que también leen Codex, Cursor y Gemini. Aquí va solo lo
que depende de herramientas de Claude Code. Si algo sirve para cualquier agente, va en AGENTS.md.

## Memoria

La memoria privada de Claude (`~/.claude/projects/.../memory/`) es para preferencias de cómo
trabaja Francisco. Un hecho del proyecto (cómo se despliega, una decisión de producto, una trampa
del CI) va al repo, en AGENTS.md o en `docs/`, para que lo vea cualquier agente y cualquier persona.

## Respuestas

Tersas: el cambio y lo necesario para entenderlo, sin preámbulos.

## Comandos de usuario

Si el usuario escribe exactamente estos comandos, se ejecutan sin saludos ni preámbulos:

- `save_state`: checkpoint de emergencia a mitad de sesión (antes de un `/clear` forzado).
  Sobrescribe `docs/ai/ACTIVE_TASK.md` con: 1) descripción de la tarea (máx. 2 líneas), 2) checklist
  con ✅ lo completado y ⬜ lo pendiente con el archivo exacto a tocar, 3) último archivo modificado y
  su estado (compila/falla), 4) siguiente paso exacto tras el reinicio. Responde solo "Estado
  guardado". Al cerrar sesión limpiamente se usa `/actualizar-contexto`, que también escribe
  ACTIVE_TASK.md.
- `backlog [texto]`: añade el texto a `docs/ai/BACKLOG.md` bajo la categoría correcta (creándola si
  no existe), como viñeta con la fecha de hoy. Responde "Idea registrada" y retoma la conversación.
