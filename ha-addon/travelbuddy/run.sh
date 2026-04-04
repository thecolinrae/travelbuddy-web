#!/usr/bin/env bashio
set -e

bashio::log.info "Starting TravelBuddy..."

# ── Read add-on configuration ─────────────────────────────────────────────────
DOMAIN=$(bashio::config 'domain')
NEXTAUTH_SECRET=$(bashio::config 'nextauth_secret')
GOOGLE_CLIENT_ID=$(bashio::config 'google_client_id')
GOOGLE_CLIENT_SECRET=$(bashio::config 'google_client_secret')
ANTHROPIC_API_KEY=$(bashio::config 'anthropic_api_key')
POSTGRES_PASSWORD=$(bashio::config 'postgres_password')
S3_ACCESS_KEY=$(bashio::config 's3_access_key')
S3_SECRET_KEY=$(bashio::config 's3_secret_key')

UNSPLASH_ACCESS_KEY=""
if bashio::config.has_value 'unsplash_access_key'; then
    UNSPLASH_ACCESS_KEY=$(bashio::config 'unsplash_access_key')
fi

GOOGLE_MAPS_API_KEY=""
if bashio::config.has_value 'google_maps_api_key'; then
    GOOGLE_MAPS_API_KEY=$(bashio::config 'google_maps_api_key')
fi

# ── Data directories ──────────────────────────────────────────────────────────
mkdir -p /data/postgres /data/minio /data/caddy

# ── PostgreSQL ────────────────────────────────────────────────────────────────
# Ensure postgres system user owns the data directory
chown -R postgres:postgres /data/postgres

if [ ! -f /data/postgres/PG_VERSION ]; then
    bashio::log.info "Initializing PostgreSQL database..."
    su-exec postgres pg_ctl initdb -D /data/postgres
fi

bashio::log.info "Starting PostgreSQL..."
su-exec postgres pg_ctl -D /data/postgres -l /var/log/postgresql.log start

# Wait for PostgreSQL to be ready
for i in $(seq 1 30); do
    su-exec postgres pg_isready -q && break
    bashio::log.info "Waiting for PostgreSQL... (${i}/30)"
    sleep 1
done
su-exec postgres pg_isready -q || bashio::exit.nok "PostgreSQL failed to start"

# Create role and database on first run
su-exec postgres psql -tc "SELECT 1 FROM pg_user WHERE usename = 'travelbuddy'" \
    | grep -q 1 \
    || su-exec postgres psql -c "CREATE USER travelbuddy WITH PASSWORD '${POSTGRES_PASSWORD}'"
su-exec postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'travelbuddy'" \
    | grep -q 1 \
    || su-exec postgres psql -c "CREATE DATABASE travelbuddy OWNER travelbuddy"

# ── MinIO ─────────────────────────────────────────────────────────────────────
bashio::log.info "Starting MinIO..."
MINIO_ROOT_USER="${S3_ACCESS_KEY}" MINIO_ROOT_PASSWORD="${S3_SECRET_KEY}" \
    minio server /data/minio --address ":9000" --quiet &
MINIO_PID=$!

# Wait for MinIO then create bucket
for i in $(seq 1 15); do
    mc alias set local http://localhost:9000 "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" \
        --quiet 2>/dev/null && break
    sleep 1
done
mc mb --ignore-existing local/travelbuddy 2>/dev/null || true

# ── Prisma migrations ─────────────────────────────────────────────────────────
bashio::log.info "Running database migrations..."
DATABASE_URL="postgresql://travelbuddy:${POSTGRES_PASSWORD}@localhost:5432/travelbuddy" \
    prisma migrate deploy --schema=/app/prisma/schema.prisma

# ── Caddy ─────────────────────────────────────────────────────────────────────
bashio::log.info "Configuring Caddy for ${DOMAIN}..."

cat > /etc/caddy/Caddyfile << EOF
{
    data_dir /data/caddy
}

${DOMAIN} {
    reverse_proxy localhost:3000

    # Proxy MinIO through /storage so presigned URLs are reachable externally
    handle_path /storage/* {
        reverse_proxy localhost:9000
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    encode gzip
}
EOF

caddy start --config /etc/caddy/Caddyfile
CADDY_PID=$(caddy environ --config /etc/caddy/Caddyfile 2>/dev/null | grep PID || true)

# ── Next.js ───────────────────────────────────────────────────────────────────
bashio::log.info "Starting TravelBuddy web server..."

export NODE_ENV=production
export PORT=3000
export HOSTNAME=127.0.0.1

export DATABASE_URL="postgresql://travelbuddy:${POSTGRES_PASSWORD}@localhost:5432/travelbuddy"

export NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
export NEXTAUTH_URL="https://${DOMAIN}"

export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}"
export GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET}"

export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
export UNSPLASH_ACCESS_KEY="${UNSPLASH_ACCESS_KEY}"
export NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="${GOOGLE_MAPS_API_KEY}"

# MinIO is internal-only; presigned URLs are rewritten to the public /storage path
export S3_ENDPOINT="http://localhost:9000"
export S3_PUBLIC_ENDPOINT="https://${DOMAIN}/storage"
export S3_BUCKET="travelbuddy"
export S3_ACCESS_KEY="${S3_ACCESS_KEY}"
export S3_SECRET_KEY="${S3_SECRET_KEY}"
export S3_REGION="us-east-1"

# Graceful shutdown
cleanup() {
    bashio::log.info "Shutting down TravelBuddy..."
    kill "${MINIO_PID}" 2>/dev/null || true
    caddy stop 2>/dev/null || true
    su-exec postgres pg_ctl -D /data/postgres stop -m fast 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

exec node /app/server.js
