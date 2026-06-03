# Getting Started — SGHCP (local development)

## Prerequisites

Install these tools once on your machine:

| Tool | Install | Purpose |
|---|---|---|
| Docker Engine | [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) | Runs Postgres + Redis |
| Go 1.21+ | [go.dev/dl](https://go.dev/dl/) | Builds and runs the API |
| Node.js 20+ | [nodejs.org](https://nodejs.org/) | Runs the frontend dev server |
| `air` | `go install github.com/air-verse/air@latest` | Go hot-reload |
| `migrate` | `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest` | DB migrations |

After installing Go tools, add the Go bin to your PATH (add this to `~/.zshrc` or `~/.bashrc`):

```bash
export PATH=$PATH:$(go env GOPATH)/bin
```

After installing Docker, add your user to the docker group (log out and back in after):

```bash
sudo usermod -aG docker $USER
```

---

## 1 — Clone and configure environment

```bash
git clone https://github.com/PFranciscoRojas/clinic-system.git
cd clinic-system
cp .env.example .env
```

The default `.env.example` values work for local development as-is. If you want to change the database password, update it in both `.env` (root) and `services/core-api/.env`.

Generate secure keys for `MASTER_KEY` and `JWT_SECRET`:

```bash
openssl rand -hex 32   # paste as MASTER_KEY
openssl rand -hex 32   # paste as JWT_SECRET
```

---

## 2 — Start infrastructure

```bash
docker compose up postgres redis -d
```

Postgres and Redis start as Docker containers with named volumes (no host directory required).

---

## 3 — Run database migrations

```bash
migrate \
  -path services/core-api/migrations \
  -database "postgres://sghcp_app:dev_password_local@localhost:5432/sghcp?sslmode=disable" \
  up
```

> If you changed `DB_USER`, `DB_PASSWORD`, or `DB_NAME` in `.env`, update the connection string above accordingly.

---

## 4 — Seed development data

Creates the demo organization, an admin user, and wires up all role permissions:

```bash
docker compose exec -T postgres \
  psql -U sghcp_app -d sghcp \
  < scripts/seed_dev.sql
```

**Demo login credentials:**

| Field | Value |
|---|---|
| Organization slug | `demo-clinica` |
| Email | `admin@demo.clinica.co` |
| Password | `Admin1234!` |

---

## 5 — Start the backend

In one terminal:

```bash
make dev
```

The API starts at `http://localhost:8080` with hot-reload. Logs stream to the terminal.

---

## 6 — Start the frontend

In a second terminal:

```bash
cd services/frontend
npm install        # first time only
npm run dev
```

The app is available at `http://localhost:5173`.

---

## Quick reference

```bash
# Stop everything
docker compose down

# Wipe DB and start fresh
docker compose down -v
docker compose up postgres redis -d
# then repeat steps 3 and 4

# Check container status
docker compose ps

# Open a DB shell
docker compose exec postgres psql -U sghcp_app -d sghcp

# Production deploy (VPS — uses bind-mount volumes)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

**`air: command not found`** — Run `export PATH=$PATH:$(go env GOPATH)/bin` and try again. Add to your shell profile to make it permanent.

**`permission denied while trying to connect to the Docker daemon`** — Run `sudo usermod -aG docker $USER`, then open a new terminal.

**`postgres` container keeps restarting** — You may have leftover volumes with bad permissions from a previous setup. Run `docker compose down -v` to remove them, then `docker compose up postgres redis -d` again.

**`role "postgres" does not exist`** — The superuser in this setup is `sghcp_app`, not `postgres`. Use `-U sghcp_app` in all `psql` commands.
