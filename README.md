# TravelBuddy Web

Responsive web app for TravelBuddy — converts the React Native/Expo mobile app to a self-hosted Next.js 15 web application.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Auth | NextAuth.js v5 — Google OAuth (Drive + Gmail scopes) |
| Database | PostgreSQL + Prisma ORM |
| File Storage | S3-compatible (AWS S3, Cloudflare R2, MinIO) |
| UI | Tailwind CSS + shadcn/ui |
| Maps | Google Maps JS API |
| AI | Anthropic Claude API (hosted key, server-side only) |
| Deployment | Docker Compose + Caddy (self-hosted) |

## Mobile app

The original React Native/Expo app lives at [thecolinrae/travelbuddy](https://github.com/thecolinrae/travelbuddy).

## Development

See `.env.example` for required environment variables.

```bash
make dev       # start local stack (Next.js + PostgreSQL + MinIO)
make migrate   # run Prisma migrations
make build     # build production image
make up        # start production stack
```

## Deployment

Self-hosted via Docker Compose + Caddy for automatic HTTPS. See `docker-compose.prod.yml` and `Caddyfile`.
