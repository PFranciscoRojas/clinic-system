## Plan de trabajo — adquisición de clientes (definido 2026-07-25)

El producto está listo y verificado en producción. El cuello no es técnico: nadie fuera de Marcela
usa Chapni, y el dominio no aparece en ninguna búsqueda, ni siquiera por su propia marca. Todo lo
que sigue apunta a eso.

**Regla de fondo:** no construir nada nuevo de producto hasta que haya señal de mercado. Las brechas
B2B (RIPS, factura DIAN, precio por tramo en el checkout) están identificadas y esperan a las
entrevistas, no al revés.

### Ya hecho en esta sesión (2026-07-25)

- ✅ `chapni.com/agenda` redirige a la app (302). Antes daba 404, así que el link de la agenda
  comercial no servía con el dominio que la gente escribe.
- ✅ `llms.txt` al día. Estaba congelado en la época de la landing de una sola página: no mencionaba
  `/precios`, `/seguridad`, los 10 capítulos de `/guia` ni las 6 guías de `/recursos`. Ahora lista
  todo, dice el precio y declara qué **no** hace (RIPS, multiespecialidad) para que un modelo no lo
  invente. Es el archivo que leen los LLM.
- ✅ Guía "cómo elegir software de historia clínica" y la revisión del plan SEO, commiteadas. Estaban
  publicadas pero vivían solo en el working tree de `../chapni` (`b13d1f8`).
- ✅ Paquete de directorios listo: `../chapni/docs/marketing/directorios-checklist.md` (`39a4f63`).

### Bloque 1 — Que Chapni exista en la búsqueda (Francisco, ~1½ h)

Sin esto todo lo demás es invisible. Verificado el 2026-07-25: el sitio no aparece ni buscando
`"Chapni"`. Lo técnico ya se descartó como causa (los 7 crawlers reciben 200, sitemap de 21 URLs);
falta que alguien enlace al dominio.

1. **Guía TIC** (`guiatic.com/vendes-tecnologia`) — colombiano, ya rankea para la consulta que nos
   interesa. 20 min, el de mejor retorno de la lista.
2. **Capterra** — un registro publica también en GetApp y Software Advice. 45 min.
3. **AlternativeTo** — autoservicio, sin verificación. 15 min. Los LLM lo citan al responder
   "alternativas a X".

Todo el texto está escrito en el checklist. A las dos semanas, volver a buscar `"Chapni"`: si el home
aparece, la teoría se confirmó y vale la pena seguir con más directorios.

### Bloque 2 — Prueba social (Francisco, una conversación)

4. **Tres frases de Marcela** con nombre, foto y ciudad. Es el hueco más grande del sitio y lo
   señalaron los dos LLM que lo evaluaron: cero prueba social en un producto que guarda historias
   clínicas. La sección se monta en cuanto existan las frases.

### Bloque 3 — Las cinco entrevistas B2B (Francisco, 2-3 semanas)

5. Insight Psicología IPS, Clínica Retornar, IPS Psicoe, Centro Psicológico Trascender y Centro de
   Familia UPB Medellín. Guion de 11 preguntas ya escrito en `PLAN_B2B_COMERCIAL.md` §4. Paradas
   desde el 2026-07-07. Bloquean el precio por tramos, la decisión sobre RIPS y publicar la tabla
   B2B en la landing.

### Bloque 4 — Venta directa a psicólogas (Francisco, ritmo semanal)

6. Los dos WhatsApp a las colegas de Marcela. Es el ensayo gratis de todo lo demás.
7. Primeros seis contactos de LinkedIn. La secuencia completa (nota de conexión, primer mensaje,
   correo frío, dos seguimientos, guion de llamada de 20 min, seis objeciones) ya está escrita en
   `PLAN_VENTA_DIRECTA.md` §4. No falta redactar nada, falta enviarlo.

### Bloque 5 — Lo mío, cuando lo pidas

- Montar la sección de testimonios en la landing, apenas existan las frases.
- Guía de `/recursos` sobre RIPS para psicólogos: ataca de frente lo que la competencia usa como
  diferenciador, con el ángulo honesto de "si tu consulta es particular, no lo necesitas".
- Capturas y clips reales del producto para la landing, que hoy es 100% texto e ilustración CSS
  (plan de 4 fases en `../chapni/docs/marketing/plan-contenido-visual-producto.md`).
- Precio por tramo en el checkout, cuando las entrevistas confirmen la tabla.

### Higiene pendiente

- **Rotar la API key de Explee** (`sk_explee_449b...`): se pegó en un chat, trátala como
  comprometida. La cuenta está congelada en $0, así que no hay gasto en riesgo, pero la llave vive.
- **WhatsApp queda apagado a propósito** hasta que haya clientes de pago: la Meta Cloud API cobra por
  conversación. Ya está todo configurado (plantillas y `phone_number_id`); solo falta el toggle, y
  encenderlo antes de tiempo es gasto puro. No es un pendiente olvidado.
- **Competidor nuevo sin analizar:** Psiconapsis (`terapeutas.psiconapsis.com`), colombiano y
  específico para psicólogos, cubre RIPS y directorio público. Revisar antes de la próxima ronda de
  precios.

### Estado técnico verificado (2026-07-25)

`schema_migrations` = 69 (dirty=f) · 5 contenedores arriba · disco 27% · CI en verde · `tsc --noEmit`
limpio · `GET /agenda` 200 con el free/busy del calendario bloqueando huecos reales. Últimos PRs:
#227 (auditoría de acceso denegado), #229 (ajuste de la IP de auditoría), #230 (registro de GEO y
competidor).

**Nota de concurrencia:** esta sesión coincidió con otra trabajando el mismo working tree; el PR #227
se llevó dentro los archivos de documentación de este cierre. No hubo pérdida, pero conviene no tener
dos sesiones sobre el mismo checkout.
