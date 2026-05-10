-- Local development seed — run AFTER migrations.
-- Safe to run multiple times (INSERT OR IGNORE).
--
-- Apply:  bun run db:seed:local
-- Reset:  delete the local D1 file, re-run migrations, then re-seed.
--
-- Test accounts (all use password: password123)
-- ─────────────────────────────────────────────
--   seed@example.com       verified email, active account
--   unverified@example.com unverified email (tests verification flow)
--
-- API key secret for local tests (server-to-server):
--   dev_sk_test_key_change_me  (prefix: dev_sk_te)

-- ─────────────────────────────────────────────────────────────────────────────
-- Users
-- Timestamps stored as Unix milliseconds (better-auth convention for D1).
-- Jan 1 2024 = 1704067200000   Feb 1 2024 = 1706745600000
-- ─────────────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO "user"
  ("id", "name", "email", "email_verified", "image", "deleted_at", "created_at", "updated_at")
VALUES
  -- Verified user — ready to sign in immediately
  (
    'seed-user-001',
    'Seed User',
    'seed@example.com',
    1,
    NULL,
    NULL,
    1704067200000,
    1704067200000
  ),
  -- Unverified user — useful for testing the email-verification flow
  (
    'seed-user-002',
    'Unverified User',
    'unverified@example.com',
    0,
    NULL,
    NULL,
    1706745600000,
    1706745600000
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Accounts (better-auth email/password credential provider)
-- password hash = bcrypt("password123", cost=10)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO "account"
  (
    "id", "account_id", "provider_id", "user_id",
    "access_token", "refresh_token", "id_token",
    "access_token_expires_at", "refresh_token_expires_at",
    "scope", "password",
    "created_at", "updated_at"
  )
VALUES
  (
    'seed-account-001',
    'seed@example.com',
    'credential',
    'seed-user-001',
    NULL, NULL, NULL, NULL, NULL, NULL,
    '$2b$10$T6/RKYy8COA54KlYf5fJZeYLRp6BzYqlb23U4bzjBZ1MchQnpsmbm',
    1704067200000,
    1704067200000
  ),
  (
    'seed-account-002',
    'unverified@example.com',
    'credential',
    'seed-user-002',
    NULL, NULL, NULL, NULL, NULL, NULL,
    '$2b$10$T6/RKYy8COA54KlYf5fJZeYLRp6BzYqlb23U4bzjBZ1MchQnpsmbm',
    1706745600000,
    1706745600000
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- API keys
-- key_hash = SHA-256("dev_sk_test_key_change_me") — pre-computed, not secret.
-- Rotate before sharing any environment with teammates.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO "api_keys"
  ("id", "user_id", "name", "key_hash", "key_prefix", "last_used_at", "expires_at", "created_at")
VALUES
  (
    'seed-api-key-001',
    'seed-user-001',
    'Local dev key',
    '0ba1ab88de3584c4c183073e0781e90466396f3dd913e559111555b2eb876601',
    'dev_sk_te',
    NULL,
    NULL,
    1704067200000
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Push devices
-- Simulates an iOS device registered for push notifications.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO "user_push_devices"
  ("id", "user_id", "token", "platform", "created_at", "updated_at")
VALUES
  (
    'seed-device-001',
    'seed-user-001',
    'dev-apns-token-0000000000000000000000000000000000000000000000000000000000000001',
    'ios',
    1704067200000,
    1704067200000
  );
