# Pruebas de aceptación (Gherkin)

Estos `.feature` son **la especificación**, no la implementación. Están en
español y describen lo que el negocio promete, no cómo lo hace el código: no
mencionan tablas, funciones ni nombres de fichero, solo lo que un profesional o
un paciente puede hacer y qué debe pasar.

Corren contra el router real de `core-api` hablando HTTP sobre un Postgres
efímero con todas las migraciones aplicadas. Si un escenario pasa, esa promesa
se cumple de verdad en el binario que se despliega.

## La frontera

**Los escenarios los escribes y los apruebas tú (Francisco). El agente implementa
los steps.** Esa división es el punto de la fase 6 del plan: el humano especifica
en lenguaje de negocio, la máquina traduce a Go. Es también el punto a partir del
cual empiezas a poder no leer el código de los agentes, porque tienes una
especificación legible que falla cuando la promesa se rompe.

Los escenarios que hay hoy son un **borrador propuesto por el agente** a partir
de la lista del plan. Léelos como propuesta: cámbialos, recórtalos o reescríbelos
en tus palabras. Un `.feature` que no dice lo que tú dirías no sirve para lo que
existe.

## Cómo correrlos

```bash
cd services/core-api
go test ./cmd/api/ -run TestAceptacion -v      # necesita Docker
go test ./cmd/api/ -run TestAceptacion -short  # se salta (sin Docker)
```

Correr un solo escenario, por etiqueta:

```bash
go test ./cmd/api/ -run TestAceptacion -godog.tags=@aislamiento
```
