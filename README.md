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

## Replace Cloudflare placeholders

Before deploying to staging/production, update `wrangler.jsonc`:

- D1 `database_id` values (create databases with `wrangler d1 create …`)
- KV namespace IDs (`wrangler kv namespace create …`)
- R2 bucket names (`wrangler r2 bucket create …`)
- Staging KV entries marked `REPLACE_STAGING_*` / `REPLACE_PROD_*`

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | `wrangler dev --local` |
| `bun run type-check` | TypeScript |
| `bun run check` | Biome format/lint |
| `bun run cf:typegen` | Regenerate `worker-configuration.d.ts` |
| `bun run db:generate` | New migration from schema (check FK order in generated SQL) |
| `bun run db:migrate` | Apply migrations to local D1 (Wrangler) |
| `bun run db:seed` | Load `scripts/seed-local.sql` into local D1 (alias of `db:seed:local`) |
| `bun run db:seed:local` | Load `scripts/seed-local.sql` into local D1 |
| `bun run db:studio` | Drizzle Studio (local SQLite file) |
| `bun run cf:deploy` / `cf:deploy:staging` | Deploy |

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
