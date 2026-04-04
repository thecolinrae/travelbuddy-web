# ── Stage 1: Build the Next.js app ────────────────────────────────────────────
FROM node:20-alpine AS builder

ARG APP_REF=main
RUN apk add --no-cache git

RUN git clone --depth 1 --branch ${APP_REF} \
    https://github.com/thecolinrae/travelbuddy-web.git /app

WORKDIR /app
RUN npm ci
RUN npx prisma generate
RUN npm run build

# ── Stage 2: HA add-on runtime ─────────────────────────────────────────────────
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# Install runtime dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    caddy \
    postgresql16 \
    postgresql16-client \
    su-exec \
    wget \
    bash

# Install Prisma CLI for running migrations at startup
RUN npm install -g prisma --prefer-offline 2>/dev/null || npm install -g prisma

# Install MinIO server + client (arch-aware)
RUN ARCH="$(uname -m)" && \
    case "${ARCH}" in \
        aarch64) MINIO_ARCH="arm64" ;; \
        *) MINIO_ARCH="amd64" ;; \
    esac && \
    wget -q "https://dl.min.io/server/minio/release/linux-${MINIO_ARCH}/minio" \
        -O /usr/local/bin/minio && \
    wget -q "https://dl.min.io/client/mc/release/linux-${MINIO_ARCH}/mc" \
        -O /usr/local/bin/mc && \
    chmod +x /usr/local/bin/minio /usr/local/bin/mc

# Copy built Next.js standalone output
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema + migrations + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
