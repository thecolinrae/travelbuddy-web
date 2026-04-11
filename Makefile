.PHONY: dev build up down logs migrate migrate-dev studio backup-db shell-db

# ── Local development ──────────────────────────────────────────────────────────

# Start local dev stack (Next.js + PostgreSQL + MinIO)
dev:
	docker compose up --build

# Run Prisma Studio against local DB
studio:
	npx prisma studio

# Apply migrations to local DB
migrate-dev:
	docker compose exec web npx prisma@6 migrate dev

# ── Production ────────────────────────────────────────────────────────────────

# Build production image
build:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start production stack (detached)
up:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Stop production stack
down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Tail logs
logs:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f web

# Apply pending Prisma migrations in production
migrate:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml exec web npx prisma@6 migrate deploy

# ── Database utilities ────────────────────────────────────────────────────────

# Dump database to a timestamped backup file
backup-db:
	docker compose exec db pg_dump -U travelbuddy travelbuddy | gzip > backup_$$(date +%Y%m%d_%H%M%S).sql.gz
	@echo "Backup saved."

# Open a psql shell in the DB container
shell-db:
	docker compose exec db psql -U travelbuddy travelbuddy
