# ─── build stage ──────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS build

WORKDIR /app

# Cache module downloads separately from source
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/core-api ./cmd/api

# ─── runtime stage ────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/
COPY --from=build /bin/core-api .

EXPOSE 8080
ENTRYPOINT ["./core-api"]
