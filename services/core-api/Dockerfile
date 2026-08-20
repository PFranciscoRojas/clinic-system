# ─── build stage ──────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS build

WORKDIR /app

# Cache module downloads separately from source
COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# The git SHA, linked into the binary so the running system can be asked which
# build it is instead of the answer being inferred from a workflow log. Defaults
# to "dev", which is what a local build should say: an operator who sees "dev" in
# the console is looking at something that never went through CI.
ARG VERSION=dev
# Y el número que un humano puede leer. Va junto al SHA, no en su lugar: la
# versión sirve para hablar de un build y el SHA para señalarlo sin ambigüedad.
ARG RELEASE=
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w \
      -X sghcp/core-api/internal/shared/buildinfo.Version=${VERSION} \
      -X sghcp/core-api/internal/shared/buildinfo.Release=${RELEASE}" \
    -o /bin/core-api ./cmd/api
# One-shot search-hash migration, run manually via `docker compose exec core-api ./rehash`
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/rehash ./cmd/rehash

# ─── runtime stage ────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/
COPY --from=build /bin/core-api /bin/rehash ./

EXPOSE 8080
ENTRYPOINT ["./core-api"]
