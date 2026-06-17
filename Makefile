.PHONY: setup up down build logs ps shell-api shell-db \
        migrate-up migrate-down migrate-create \
        test-api test-ai lint-api lint-ai \
        sqlc dev frontend-build

# ── Bootstrap de datos/volumes (ejecutar una vez antes de `make up`) ──────────
setup:
	mkdir -p data/postgres data/redis data/audio data/caddy
	cp -n .env.example .env || true
	@echo "Edita .env con tus valores reales, luego ejecuta: make up"

# ── Ciclo de vida del stack ───────────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

ps:
	docker compose ps

# ── Shells de diagnóstico ──────────────────────────────────────────────────────
shell-api:
	docker compose exec core-api sh

shell-db:
	docker compose exec postgres psql -U $${DB_USER} -d $${DB_NAME}

# ── Migraciones (imagen migrate/migrate; credenciales desde .env) ─────────────
# Postgres no publica 5432 al host (hardening), así que el contenedor migrate
# comparte la red de sghcp_postgres y llega por localhost:5432 dentro de su netns.
migrate-up:
	@set -a; . ./.env; set +a; \
	docker run --rm -v $(CURDIR)/services/core-api/migrations:/migrations --network container:sghcp_postgres migrate/migrate \
		-path=/migrations/ -database "postgres://$$DB_USER:$$DB_PASSWORD@localhost:5432/$$DB_NAME?sslmode=disable" up

migrate-down:
	@set -a; . ./.env; set +a; \
	docker run --rm -v $(CURDIR)/services/core-api/migrations:/migrations --network container:sghcp_postgres migrate/migrate \
		-path=/migrations/ -database "postgres://$$DB_USER:$$DB_PASSWORD@localhost:5432/$$DB_NAME?sslmode=disable" down 1

migrate-create:
	@read -p "Nombre de la migración: " name; \
	migrate create -ext sql -dir services/core-api/migrations -seq $$name

# ── Tests ─────────────────────────────────────────────────────────────────────
test-api:
	cd services/core-api && go test -race -count=1 ./...

test-ai:
	cd services/ai-service && python -m pytest tests/ -v

# ── Linters ──────────────────────────────────────────────────────────────────
lint-api:
	cd services/core-api && golangci-lint run ./...

lint-ai:
	cd services/ai-service && ruff check src/ && mypy src/

# ── Generación de código ──────────────────────────────────────────────────────
sqlc:
	cd services/core-api && sqlc generate

# ── Desarrollo local (sin Caddy, core-api directo en :8080) ──────────────────
AIR ?= $(shell which air 2>/dev/null || echo $$(go env GOPATH)/bin/air)

dev:
	docker compose up postgres redis -d
	cd services/core-api && set -a && . ./.env && set +a && $(AIR)

# ── Seed de desarrollo ────────────────────────────────────────────────────────
seed:
	docker compose exec -T postgres psql -U $${DB_USER} -d $${DB_NAME} < scripts/seed_dev.sql

# ── Frontend ──────────────────────────────────────────────────────────────────
frontend-build:
	cd services/frontend && npm run build
