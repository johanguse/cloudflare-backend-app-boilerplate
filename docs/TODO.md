# Cloudflare Backend Boilerplate — TODO

Track implementation progress. Each item maps to a concrete file or action.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 1 — Project Scaffolding

- [x] **1.1** Initialize project with `bun init` and set up `package.json`
  - Hono, Zod, Wrangler, Biome, Drizzle packages, Vitest pool (Better Auth added in Phase 3)
- [x] **1.2** Configure `tsconfig.json` (worker-oriented compiler options, `@/*` path alias)
- [x] **1.3** Configure `biome.json` (tab indent, double quotes, trailing commas — mirror fullstack boilerplate)
- [x] **1.4** Create `wrangler.jsonc` with multi-environment support
  - Top-level config for local/dev; `env.staging` / `env.production` overrides
  - Bindings: `DB` (D1), `SESSION_KV`, `CACHE_KV`, `STORAGE` (R2)
  - Cron trigger: `0 6 * * *` (session cleanup)
  - Replace placeholder `database_id` / KV IDs / `REPLACE_*` before real deploys
- [x] **1.5** Create `worker-configuration.d.ts` (global `Env` interface; optional `bun run cf:typegen` with Node 22+)
- [x] **1.6** Create `.dev.vars.example`, `.env.staging.example`, `.env.production.example`
- [x] **1.7** Create `.gitignore`
- [x] **1.8** Set up `src/index.ts` — Hono app, CORS (open for Phase 1), `health` routes, `scheduled()` cron stub

---

## Phase 2 — Database Layer

- [x] **2.1** Configure `drizzle.config.ts`
  - Local: SQLite file (default `.data/local.sqlite`, override with `SQLITE_PATH`)
  - Remote D1: `DRIZZLE_D1_REMOTE=true` + `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`
- [x] **2.2** Create `src/db/schema/auth.ts` — `user`, `session`, `account`, `verification` (Better Auth–compatible core)
- [x] **2.3** Create `src/db/schema/uploads.ts` — `file_uploads`
- [x] **2.4** Create `src/db/schema/api-keys.ts` — `api_keys` (+ `key_prefix` for dashboard display)
- [x] **2.5** Create `src/lib/db.ts` — `createDb(d1)` via `drizzle-orm/d1`
- [x] **2.6** Initial migration — `src/db/migrations/0000_init.sql` (statements ordered for SQLite foreign keys; re-run `drizzle-kit generate` carefully — config uses ordered schema paths)
- [x] **2.7** Create `scripts/seed-local.sql` — seed user, credential account (`password123` bcrypt), API key (`dev_sk_test_key_change_me` → SHA-256 in `key_hash`)

---

## Phase 3 — Core Library

- [x] **3.1** Create `src/lib/types.ts` — `HonoEnv`, `ApiSuccess` / `ApiPaginated` / `ApiErrorBody`, `isApiErrorBody`
- [x] **3.2** Create `src/lib/config.ts` — Zod-validated `getConfig(env)`, dev default for short `BETTER_AUTH_SECRET` when `ENVIRONMENT` is local/development
- [x] **3.3** Create `src/lib/auth.ts` — Better Auth + Drizzle (auth + `jwks` tables), `bearer` + `jwt` (15m access) + `emailOTP`, KV `secondaryStorage`, `session.storeSessionInDatabase`, Google/Apple when env vars set, rate limit on secondary storage
- [x] **3.4** Create `src/lib/storage.ts` — `uploadFile`, `getObject`, `deleteFile`, `publicFileUrl`
- [x] **3.5** Create `src/lib/email.ts` — Cloudflare Email Service binding; console logging in dev; verification, reset, OTP helpers
- [x] **3.x** Mount Better Auth on `app.all("/api/auth/*")` in `src/index.ts`; migration `0001_*` adds `jwks` table; `0002_*` drops legacy organization tables if present; `wrangler.jsonc` `FROM_EMAIL`; `worker-configuration.d.ts` secrets/vars

---

## Phase 4 — Middleware

- [x] **4.1** Create `src/middlewares/cors.ts`
  - Allow all origins in dev, configure allowlist in prod
  - Expose `Authorization`, `Content-Type` headers
  - Mobile-friendly: no credentials mode needed
- [x] **4.2** Create `src/middlewares/auth.ts`
  - Extract `Authorization: Bearer <token>` header
  - Validate JWT via Better Auth
  - Attach `user` + `session` to context
  - Return `401` with structured error if invalid
- [x] **4.3** Create `src/middlewares/api-key.ts`
  - Extract `X-API-Key` header
  - Hash and compare against `api_keys` table
  - Update `last_used_at`
  - Attach user to context
- [x] **4.4** Create `src/middlewares/error.ts`
  - Global Hono error handler
  - Map known errors to HTTP codes
  - Structured error response: `{error: {code, message, details?}}`
  - Log 5xx errors (console.error or Sentry)

---

## Phase 5 — Auth Routes

- [x] **5.1** `POST /api/v1/auth/register`
  - Body: `{email, password, name}`
  - Returns: `{data: {user, accessToken, refreshToken}}`
  - Sends verification email
- [x] **5.2** `POST /api/v1/auth/login`
  - Body: `{email, password}`
  - Returns: `{data: {user, accessToken, refreshToken}}`
- [x] **5.3** `POST /api/v1/auth/logout`
  - Requires: Bearer token
  - Invalidates session in D1 + KV
- [x] **5.4** `POST /api/v1/auth/refresh`
  - Body: `{refreshToken}`
  - Returns: `{data: {accessToken, refreshToken}}`
- [x] **5.5** `POST /api/v1/auth/verify-email`
  - Body: `{token}`
  - Marks user email as verified
- [x] **5.6** `POST /api/v1/auth/forgot-password`
  - Body: `{email}`
  - Sends reset link
- [x] **5.7** `POST /api/v1/auth/reset-password`
  - Body: `{token, newPassword}`
- [x] **5.8** `GET /api/v1/auth/google` + callback — OAuth Google flow
  - GET returns `{ data: { url } }` to start the browser flow (callback still hits `/api/auth/callback/google`).
  - `POST /api/v1/auth/google` (native) accepts `{ idToken, nonce?, accessToken? }` and returns `{data: {user, accessToken, refreshToken}}` (deep link with embedded tokens is not handled by Better Auth callbacks by default).
- [x] **5.9** `POST /api/v1/auth/apple` — Sign in with Apple
  - Body: `{identityToken, authorizationCode, fullName?}`
  - Returns: `{data: {user, accessToken, refreshToken}}`

---

## Phase 6 — User Routes

- [x] **6.1** `GET /api/v1/users/me` — get current user profile
- [x] **6.2** `PATCH /api/v1/users/me` — update profile (name, avatar)
- [x] **6.3** `DELETE /api/v1/users/me` — account deletion (soft delete)
- [x] **6.4** `POST /api/v1/users/me/devices` — register push token
  - Body: `{token, platform: "ios" | "android"}`
- [x] **6.5** `DELETE /api/v1/users/me/devices/:token` — unregister push token

---

## Phase 7 — Uploads Routes

- [x] **7.1** `POST /api/v1/uploads` — upload file to R2
  - Multipart form or JSON with base64 (for small files)
  - Returns: `{data: {key, url, size, mimeType}}`
- [x] **7.2** `GET /api/v1/uploads/:key/url` — get signed URL (private files)
- [x] **7.3** `DELETE /api/v1/uploads/:key` — delete file from R2

---

## Phase 8 — API Keys Routes

- [x] **8.1** `GET /api/v1/api-keys` — list user's API keys (no hash, show prefix only)
- [x] **8.2** `POST /api/v1/api-keys` — create API key
  - Returns full key **once** (store hash in DB)
- [x] **8.3** `DELETE /api/v1/api-keys/:id` — revoke API key

---

## Phase 9 — Health + Cron

- [x] **9.1** `GET /health` — liveness check (no auth) — **`GET /health`** and **`GET /api/v1/health`**
  - Returns: `{ data: { status: "ok", version: "0.1.0", timestamp: "...", environment } }`
- [x] **9.2** `GET /health/db` — DB connectivity check
- [x] **9.3** Cron handler in `index.ts`
  - `scheduled()` runs D1 cleanup: expired `session` and `verification` rows (KV entries rely on TTL).

---

## Phase 10 — Testing

- [x] **10.1** Configure `vitest.config.ts` — Cloudflare Workers pool
- [x] **10.2** Create `test/fixtures/worker.ts` — minimal worker fixture
- [x] **10.3** `test/integration/health.spec.ts`
- [x] **10.4** `test/integration/auth.spec.ts`
  - Register, login, refresh, logout flows
  - Invalid token → 401
- [x] **10.5** `test/integration/users.spec.ts`
  - Get/patch profile
  - Unauthorized access → 401
- [x] **10.6** `test/integration/api-keys.spec.ts`

---

## Phase 11 — Scripts & DX

- [x] **11.1** Add all npm scripts to `package.json`
  - `dev`, `build`, `build:staging`, `build:production`
  - `cf:deploy`, `cf:deploy:staging`, `cf:check`
  - `db:generate`, `db:migrate`, `db:migrate:staging`, `db:migrate:prod`
  - `db:seed:local`, `db:studio`
  - `check` (Biome), `type-check`, `test`, `test:run`
- [x] **11.2** Create `scripts/generate-openapi.ts` — generates `docs/openapi.json` from the route registry + zod schemas in `src/lib/schemas.ts` (`bun run openapi:generate`)
- [x] **11.3** Create `README.md` — setup instructions, env var reference, deployment guide

---

## Phase 12 — Optional / Post-MVP

- [ ] **12.1** Stripe billing — subscription plans
  - `POST /api/v1/billing/checkout` — create Stripe Checkout session
  - `POST /api/v1/webhooks/stripe` — handle payment events
- [ ] **12.2** Push notifications service
  - APNS (iOS) via `node-apn` or Cloudflare Worker + APNS HTTP/2
  - FCM (Android) via `firebase-admin` or FCM v1 REST API
  - `POST /api/v1/notifications/send` (internal)
- [x] **12.3** Rate limiting via KV
  - Sliding-window counter (`src/lib/rate-limit.ts`) backed by `CACHE_KV`, keyed by `userId` (when authenticated) or IP
  - Per-route limits: global `/api/v1/*` baseline, tighter auth login/register/email-action limits, per-user chat and analysis-creation limits
- [x] **12.4** Sentry error tracking — `@sentry/cloudflare` (`Sentry.withSentry` in `src/index.ts`, `Sentry.captureException` in `src/middlewares/error.ts` for unexpected 500s only). No-op until `SENTRY_DSN` is set.
- [ ] **12.5** OpenAPI client generation
  - TypeScript client: `openapi-typescript` → for Expo apps
  - Swift client: `CreateAPI` or `swift-openapi-generator` → for iOS apps
- [ ] **12.6** Trigger.dev integration for heavy background jobs

---

## Implementation Order

```
Phase 1 → 2 → 3 → 4 → 5 → 6 → 9 → 10 → 7 → 8 → 11 → 12
  ^scaffold  ^db  ^lib  ^mw  ^auth ^users ^health ^tests ^uploads ^keys ^dx ^extras
```

Target: **B2C / single-user** apps — no organizations or multi-tenant routes.

Start with **Phase 1–5** to get a working auth API, then expand.

**Now:** Phase **5** — auth routes (`docs/TODO.md`).
