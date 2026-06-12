# Cloudflare Backend Boilerplate — Implementation Plan

**Purpose:** A backend-only boilerplate for mobile apps (React Native/Expo + SwiftUI/iOS), hosted entirely on Cloudflare infrastructure (Workers, D1, R2, KV). No frontend SPA — pure API server.

**Audience:** B2C / single-user apps — no organizations or multi-tenant workspaces in the schema or planned routes.

## Current status

| Phase | State |
|-------|--------|
| Phase 1 — Scaffolding | Done — `src/index.ts`, Hono + CORS stub, `/health` + `/api/v1/health`, cron stub, `wrangler.jsonc`, Biome, TypeScript |
| Phase 2 — Database | Done — Drizzle schema modules, `drizzle.config.ts`, `src/lib/db.ts`, `src/db/migrations/0000_init.sql` (FK-safe order), `scripts/seed-local.sql` |
| Phase 3 — Core library | Done — `config`, `types`, Better Auth (`bearer` + `jwt` + `emailOTP`), `email`, `storage`, `/api/auth/*` |
| Phase 4 — Middleware | Done — `corsMiddleware`, `requireBearerAuth`, `requireApiKeyAuth`, `globalErrorHandler`; `ExecutionContext` passed into Hono `fetch` |
| Phase 5+ | Follow `docs/TODO.md` |

**Before first remote deploy:** Replace placeholder D1 database IDs, KV namespace IDs, and R2 bucket names in `wrangler.jsonc` with resources you create in the Cloudflare dashboard (or via `wrangler`). Staging/production env blocks contain `REPLACE_*` KV placeholders by design.

**Tooling:** Wrangler 4.x expects **Node.js 22+** for CLI commands. Use `bun run type-check` locally if your shell is on an older Node.

---

## Mobile app integration

- **Base URL:** Point the app at `https://<your-worker-host>` (or `http://127.0.0.1:8787` for `wrangler dev --local`).
- **Auth:** Store `accessToken` / `refreshToken` in secure storage (Keychain, EncryptedSharedPreferences); send `Authorization: Bearer <accessToken>` on API calls.
- **OAuth redirects:** Configure Google/Apple console redirect URIs to your API domain (or localhost for dev). For native apps, use the pattern described in Phase 5 (deep link / universal link with tokens) once auth routes exist.
- **CORS:** Phase 1 uses `origin: "*"` for simplicity; Phase 4 narrows this using `TRUSTED_ORIGINS` for production API hosts and any allowed dev origins.
- **OpenAPI:** After routes land, generate clients for TypeScript (Expo) and Swift (CreateAPI / swift-openapi-generator) from the spec — see Phases 11–12 in `TODO.md`.

---

## References

| Project | What we take from it |
|---|---|
| `cloudflare-fullstack-boilerplate` | Core stack (Hono, Drizzle, Better Auth, Biome, Vitest, Wrangler config, multi-env pattern) |
| `llmgenerator-project` | REST API structure, R2 storage service, API key auth, credit system, Trigger.dev pattern |
| `fastapi-boilerplate-backend` | Module/domain structure (auth, users, uploads, subscriptions), service layer pattern, docs layout |

---

## Architecture

### Runtime
- **Cloudflare Workers** — edge runtime, globally distributed, zero cold starts
- **Hono** — lightweight, Workers-native HTTP framework

### Storage
- **D1** (SQLite) — primary database via Drizzle ORM
- **KV** — session cache, rate-limit counters, ephemeral data
- **R2** — binary file storage (profile images, attachments, exports)

### Auth Strategy (mobile-first)
- **Better Auth** with **JWT Bearer tokens** (not cookies — mobile clients don't handle cookies well)
- Email + password, OAuth2 (Google, Apple via Sign in with Apple)
- Email OTP for 2FA
- API key auth for server-to-server calls

### API Design
- **REST API** at `/api/v1/*` — primary interface for mobile apps
- **OpenAPI spec** auto-generated (Scalar UI for docs)
- No tRPC (keep it simple; mobile clients can't use the tRPC type bridge natively)

### Background Jobs
- **Cloudflare Cron Triggers** — lightweight scheduled tasks (session cleanup, digest emails)
- **Trigger.dev** — optional, for complex async workflows

---

## Project Structure

```
cloudflare-backend-app-boilerplate/
├── src/
│   ├── db/
│   │   ├── schema/              # Drizzle table definitions
│   │   │   ├── auth.ts          # users, sessions, accounts, verifications
│   │   │   └── uploads.ts       # file upload records
│   │   ├── migrations/          # Generated Drizzle migrations
│   │   └── seeds/               # Local dev seed data
│   │
│   ├── lib/
│   │   ├── auth.ts              # Better Auth config (JWT mode, mobile-friendly)
│   │   ├── config.ts            # Env var validation + typed config
│   │   ├── db.ts                # Drizzle client factory
│   │   ├── storage.ts           # R2 upload/download/delete helpers
│   │   ├── email.ts             # Cloudflare Email Service
│   │   └── types.ts             # Global types (Env, HonoContext, etc.)
│   │
│   ├── middlewares/
│   │   ├── auth.ts              # JWT validation middleware
│   │   ├── cors.ts              # CORS for mobile clients
│   │   ├── api-key.ts           # API key auth middleware
│   │   └── error.ts             # Global error handler
│   │
│   ├── routes/
│   │   ├── auth/
│   │   │   ├── index.ts         # Mount auth sub-routes
│   │   │   ├── register.ts      # POST /auth/register
│   │   │   ├── login.ts         # POST /auth/login
│   │   │   ├── logout.ts        # POST /auth/logout
│   │   │   ├── refresh.ts       # POST /auth/refresh
│   │   │   ├── oauth.ts         # GET /auth/google, /auth/apple
│   │   │   ├── verify-email.ts  # POST /auth/verify-email
│   │   │   └── reset-password.ts
│   │   ├── users/
│   │   │   ├── index.ts         # GET/PATCH /users/me
│   │   │   └── devices.ts       # POST /users/me/devices (push tokens)
│   │   ├── uploads/
│   │   │   └── index.ts         # POST /uploads (R2 presigned URLs)
│   │   ├── api-keys/
│   │   │   └── index.ts         # CRUD /api-keys
│   │   ├── webhooks/
│   │   │   └── stripe.ts        # POST /webhooks/stripe
│   │   └── health.ts            # GET /health
│   │
│   ├── services/
│   │   ├── user.ts              # User business logic
│   │   ├── upload.ts            # File upload orchestration
│   │   ├── notification.ts      # Push notification service (APNS/FCM)
│   │   └── billing.ts           # Stripe integration (optional)
│   │
│   └── index.ts                 # App entry point, route mounting, cron handlers
│
├── test/
│   ├── fixtures/
│   │   └── worker.ts            # Vitest Cloudflare worker fixture
│   ├── integration/
│   │   ├── health.spec.ts
│   │   ├── auth.spec.ts
│   │   └── users.spec.ts
│   └── unit/
│       └── services/
│
├── docs/
│   ├── PLAN.md                  # This file
│   ├── TODO.md                  # Task tracker
│   └── openapi.json             # Generated OpenAPI spec (gitignored after gen)
│
├── scripts/
│   ├── seed-local.sql           # D1 local seed data
│   └── generate-openapi.ts      # OpenAPI spec generator
│
├── .dev.vars.example            # Local secrets template
├── .env.staging.example
├── .env.production.example
├── biome.json                   # Linter/formatter config
├── drizzle.config.ts            # Drizzle ORM config (local + D1)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── wrangler.jsonc               # Cloudflare deployment config
└── worker-configuration.d.ts   # Generated Worker env types
```

---

## Key Design Decisions

### 1. JWT over Cookies (Mobile-first Auth)
Mobile apps (React Native, SwiftUI) work with Bearer tokens, not cookies. Better Auth will be configured in token mode with `Authorization: Bearer <token>` headers. Tokens stored in device secure storage (Keychain on iOS, EncryptedSharedPreferences on Android).

### 2. REST-first, No tRPC
tRPC requires a shared TypeScript type definition — works great for React apps but not for Swift. REST + OpenAPI gives us a spec that can generate both TypeScript and Swift clients automatically.

### 3. Module Pattern (from FastAPI boilerplate)
Each domain (auth, users, uploads, etc.) has a dedicated folder under `routes/` and `services/`. Routes handle HTTP concerns; services handle business logic. Mirrors the FastAPI boilerplate's `routes.py` + `service.py` pattern.

### 4. Environment Strategy (from fullstack boilerplate)
Three environments: `local`, `staging`, `production`. Non-sensitive vars in `wrangler.jsonc`; secrets via `wrangler secret put`. Same multi-env Drizzle config (SQLite file locally, D1 HTTP in cloud).

### 5. No Frontend Assets
The `ASSETS` binding and SPA fallback are removed. The worker is purely API. A different DNS route handles mobile app deep links if needed.

---

## Cloudflare Bindings

```jsonc
// wrangler.jsonc bindings
{
  "d1_databases": [{ "binding": "DB", "database_name": "app-db" }],
  "kv_namespaces": [
    { "binding": "SESSION_KV", "id": "..." },
    { "binding": "CACHE_KV", "id": "..." }
  ],
  "r2_buckets": [{ "binding": "STORAGE", "bucket_name": "app-storage" }],
  "send_email": [{ "name": "EMAIL" }]
}
```

---

## Auth Flows (Mobile)

```
Register:       POST /api/v1/auth/register → {accessToken, refreshToken, user}
Login:          POST /api/v1/auth/login    → {accessToken, refreshToken, user}
Refresh:        POST /api/v1/auth/refresh  → {accessToken, refreshToken}
OAuth Google:   GET  /api/v1/auth/google   → redirect → deep link with tokens
OAuth Apple:    POST /api/v1/auth/apple    → {accessToken, refreshToken, user}
Verify Email:   POST /api/v1/auth/verify-email {token}
Reset Password: POST /api/v1/auth/reset-password {token, newPassword}
```

Access token: **15 min** | Refresh token: **30 days** | Stored in device secure storage

---

## API Conventions

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <accessToken>`
- Content-Type: `application/json`
- Pagination: `?page=1&limit=20` → `{data: [], meta: {total, page, limit, hasMore}}`
- Errors: `{error: {code: "UNAUTHORIZED", message: "...", details?: {}}}`
- Success: `{data: <resource>}` or `{data: <resource[]>, meta: {...}}`

---

## Testing Strategy

- **Vitest** with Cloudflare Workers pool (same as fullstack boilerplate)
- Integration tests against real in-process worker (no mocking the runtime)
- Test fixtures: seeded D1 in-memory, mocked R2, mocked Cloudflare Email
- Gate: `bun test` must pass before deploy

---

## Deployment

```bash
# Dev
bun run dev              # wrangler dev --local

# Staging
bun run build:staging
bun run cf:deploy:staging

# Production
bun run build:production
bun run cf:deploy
```

---

## Optional Additions (Post-MVP)

- **Stripe billing** — subscription plans, credit packs
- **Push notifications** — APNS (iOS) + FCM (Android) via Cloudflare Workers + Queues
- **Rate limiting** — via KV counters per IP/user
- **OpenAPI client generation** — `openapi-typescript` for Expo, `CreateAPI` for Swift
- **Trigger.dev** — complex background job workflows
- **Sentry** — error tracking for production
- **PostHog** — mobile analytics (server-side events)
