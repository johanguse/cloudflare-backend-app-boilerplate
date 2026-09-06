# Cloudflare backend app boilerplate

API-only Cloudflare Worker (Hono) for **mobile clients**: Expo/React Native, SwiftUI, or any HTTP client. See [`docs/PLAN.md`](docs/PLAN.md) and [`docs/TODO.md`](docs/TODO.md).

## Requirements

- [Bun](https://bun.sh) for installs and scripts
- **Node.js 22+** if you run `wrangler` / `bun run cf:typegen` from a Node-powered install (Wrangler 4.x)

## Quick start

```bash
bun install
cp .dev.vars.example .dev.vars
# Edit .dev.vars when secrets exist (Phase 3+).

bun run dev
```

- **Health:** `GET http://127.0.0.1:8787/health` and `GET http://127.0.0.1:8787/api/v1/health`
- **Better Auth** (mobile-friendly): `GET|POST /api/auth/*` — see [Better Auth docs](https://www.better-auth.com/docs). Uses Bearer + JWT (`bearer` + `jwt` plugins). Apply migrations **including** `src/db/migrations/0001_*.sql` for the `jwks` table before first auth use.

After migrate + seed, sign in via `POST /api/v1/auth/login` with JSON `{ "email", "password" }` (see seeded users below).

## Seeded local users (`db:seed` / `db:seed:local`)

**Local D1 only.** Passwords are for development; never deploy or reuse these in production.

| Email | Password | User id |
|-------|----------|---------|
| `admin@drape.local` | `password123` | `seed-user-001` |
| `dev@drape.local` | `DevSeed#2026` | `seed-user-002` |

**Seeded API key** (owner: `admin@drape.local`):

- **Header:** `X-API-Key: <full secret>`
- **Full secret:** `dev_sk_test_key_change_me`
- **Prefix (stored in DB):** `dev_sk_te` — the app compares a SHA-256 hash of the full secret; use the full value in the header.

If `db:seed` fails with a unique constraint, remove existing seed rows (see comments at the top of `scripts/seed-local.sql`) or reset local D1, then run the seed again.

## Environment variables

Bindings (`DB`, `SESSION_KV`, `CACHE_KV`, `STORAGE`, `AI`, `EMAIL`) live in `wrangler.jsonc`, not in env files. The rest:

| Variable | Where set | Required | Purpose |
|----------|-----------|----------|---------|
| `ENVIRONMENT` | `wrangler.jsonc` vars | Yes | `local` / `staging` / `production` — gates dev-only fallbacks (see `src/lib/config.ts`) |
| `APP_NAME` | `wrangler.jsonc` vars | Yes | Display name, e.g. for emails |
| `BETTER_AUTH_URL` | `wrangler.jsonc` vars | Yes | Public base URL of this Worker (Better Auth callback base) |
| `TRUSTED_ORIGINS` | `wrangler.jsonc` vars | Yes | Comma-separated CORS/Better Auth allowlist |
| `FROM_EMAIL` | `wrangler.jsonc` vars | Yes | Sender address; its domain must be onboarded (`wrangler email sending enable <domain>`) |
| `AI_MODEL` | `wrangler.jsonc` vars | No | Workers AI text model for `POST /api/v1/chat/stream` (default `@cf/meta/llama-3.1-8b-instruct`) |
| `BETTER_AUTH_SECRET` | `.dev.vars` / `wrangler secret` | Staging/prod only | Session signing secret, **min 32 chars** in staging/production. Local gets a dev-only default when unset |
| `EMAIL_DEV_DELIVERY` | `.dev.vars` | No | Set `true` to actually send email in local dev instead of logging it |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `.dev.vars` / `wrangler secret` | No | Enables Google OAuth (`/api/v1/auth/google`) when both are set |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | `.dev.vars` / `wrangler secret` | No | Enables Sign in with Apple (`/api/v1/auth/apple`) when both are set |
| `R2_PUBLIC_BASE_URL` | `.dev.vars` / `wrangler secret` | No | Public R2 origin (custom domain/CDN); when set, upload URLs are direct public URLs instead of signed proxy links |
| `OPENROUTER_KEY` | `.dev.vars` / `wrangler secret` | No | Enables `POST /api/v1/analyses` (vision analysis via OpenRouter) |
| `SENTRY_DSN` | `.dev.vars` / `wrangler secret` | No | Enables Sentry error tracking (unset = SDK disabled, no-op) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_D1_DATABASE_ID`, `DRIZZLE_D1_REMOTE` | `.env.staging` / `.env.production` | Only for `drizzle-kit` against remote D1 | Local tooling (Drizzle Studio/introspection), never read by the deployed Worker |

Copy `.dev.vars.example` → `.dev.vars` (local secrets, gitignored) and `.env.staging.example` / `.env.production.example` → `.env.staging` / `.env.production` (local tooling only) as needed. `worker-configuration.d.ts` documents the full `Env` type — regenerate with `bun run cf:typegen` after adding a var (Node 22+).

## Rate limiting

`src/lib/rate-limit.ts` is a sliding-window limiter backed by the `CACHE_KV` binding — no extra service needed. It's applied at three layers:

- **Global baseline** (`src/index.ts`): 300 req/min per IP across all of `/api/v1/*`.
- **Auth routes** (`src/routes/auth.ts`): tighter per-IP limits on `/login` (10/min), `/register` (5/hour), and the email-sending endpoints — `/forgot-password`, `/reset-password`, `/resend-verification` (5/hour combined).
- **Cost-sensitive routes**: `/api/v1/chat/stream` (20/5min) and `POST /api/v1/analyses` (10/hour) are limited per authenticated user, since both call billed AI APIs.

A blocked request gets `429` with a `Retry-After` header and `{ "error": { "code": "RATE_LIMITED" } }`. Call `rateLimiter({ limit, windowSeconds, keyPrefix })` to add a limit to a new route; KV writes aren't atomic, so treat it as abuse protection, not a precise billing guardrail.

## Error tracking

Set `SENTRY_DSN` (see table above) to enable [Sentry](https://sentry.io) via `@sentry/cloudflare`. Unset, the SDK stays disabled (`enabled: false`), so there's no setup required for local dev. Only unexpected `500`s reach Sentry (`src/middlewares/error.ts`) — validation errors and typical 4xx auth failures are expected user input, not bugs, so they aren't reported.

## Replace Cloudflare placeholders

Before deploying to staging/production, update `wrangler.jsonc`:

- D1 `database_id` values (create databases with `wrangler d1 create …`)
- KV namespace IDs (`wrangler kv namespace create …`)
- R2 bucket names (`wrangler r2 bucket create …`)
- Staging KV entries marked `REPLACE_STAGING_*` / `REPLACE_PROD_*`

## Deployment guide

1. **Create Cloudflare resources per environment** (staging shown; repeat with `production` names):
   ```bash
   wrangler d1 create cf-boilerplate-backend-db-staging
   wrangler kv namespace create SESSION_KV --env staging
   wrangler kv namespace create CACHE_KV --env staging
   wrangler r2 bucket create cf-boilerplate-backend-storage-staging
   ```
2. **Paste the returned IDs** into `wrangler.jsonc` under `env.staging` (`database_id`, both KV `id`s) — replacing the `REPLACE_STAGING_*` / `00000000…` placeholders.
3. **Set real vars**: update `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, and `FROM_EMAIL` under `env.staging` / `env.production` in `wrangler.jsonc` (`FROM_EMAIL`'s domain needs `wrangler email sending enable <domain>` first).
4. **Set secrets** (never committed):
   ```bash
   wrangler secret put BETTER_AUTH_SECRET --env staging   # 32+ random chars
   wrangler secret put GOOGLE_CLIENT_SECRET --env staging # only if using Google OAuth
   wrangler secret put OPENROUTER_KEY --env staging       # only if using /analyses
   wrangler secret put SENTRY_DSN --env staging           # only if using error tracking
   ```
5. **Apply migrations to the remote D1 database**: `bun run db:migrate:staging` (or `db:migrate:prod`).
6. **Verify the bundle before shipping**: `bun run build:staging` (dry-run bundle to `dist/`, no deploy) or `bun run cf:check` for the default environment.
7. **Deploy**: `bun run cf:deploy:staging` (add a `cf:deploy:production` script, or run `wrangler deploy --env production`, once production is ready).
8. **Smoke test**: `GET <BETTER_AUTH_URL>/api/v1/health` and `/health/db`.

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | `wrangler dev --local` |
| `bun run type-check` | TypeScript |
| `bun run check` | Biome format/lint |
| `bun run cf:typegen` | Regenerate `worker-configuration.d.ts` |
| `bun run build` / `build:staging` / `build:production` | Dry-run bundle to `dist/` (no deploy) — sanity-checks the Worker builds for that environment |
| `bun run cf:check` | Type-check + dry-run deploy (default environment) |
| `bun run openapi:generate` | Regenerate `docs/openapi.json` from `src/routes/*` + `src/lib/schemas.ts` |
| `bun run db:generate` | New migration from schema (check FK order in generated SQL) |
| `bun run db:migrate` | Apply migrations to local D1 (Wrangler) |
| `bun run db:migrate:staging` / `db:migrate:prod` | Apply migrations to remote D1 |
| `bun run db:seed` | Load `scripts/seed-local.sql` into local D1 (alias of `db:seed:local`) |
| `bun run db:seed:local` | Load `scripts/seed-local.sql` into local D1 |
| `bun run db:studio` | Drizzle Studio (local SQLite file) |
| `bun run cf:deploy` / `cf:deploy:staging` | Deploy |
| `bun run test` / `test:run` | Vitest (watch / single run) |

### Database workflow

1. **Migrate** (requires Node 22+ for `wrangler`): `bun run db:migrate`
2. **Seed** (optional): `bun run db:seed` or `bun run db:seed:local`

Local SQLite for Drizzle Kit / Studio lives at `.data/local.sqlite` by default (`SQLITE_PATH` overrides). Worker dev uses D1’s local simulation via Wrangler, not that file.

**Remote D1** (introspection / Studio against staging): set vars from `.env.staging.example`, then run `DRIZZLE_D1_REMOTE=true bunx drizzle-kit studio` (see comments in `drizzle.config.ts`).

### Local seed data

After running `bun run db:seed:local` the following records are available:

#### Test users

| Email               | Password       | Email verified | Notes                                 |
|---------------------|----------------|----------------|---------------------------------------|
| `admin@drape.local` | `password123`  | Yes            | Primary dev account, ready to sign in |
| `dev@drape.local`   | `DevSeed#2026` | Yes            | Secondary dev account                 |

#### API key (server-to-server)

| Field | Value |
|-------|-------|
| Secret | `dev_sk_test_key_change_me` |
| Prefix | `dev_sk_te` |
| Owner | `admin@drape.local` |
| Expires | Never (local only) |

> The seed is idempotent (`INSERT OR IGNORE`) — safe to run multiple times.

#### Reset local database

```bash
# 1. Delete Wrangler’s local D1 state
rm -rf .wrangler/state/v3/d1

# 2. Re-apply migrations
bun run db:migrate

# 3. Re-seed
bun run db:seed:local
```
