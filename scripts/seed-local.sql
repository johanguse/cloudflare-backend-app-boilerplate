-- Local development seed — run AFTER migrations.
-- Safe to run multiple times (INSERT OR IGNORE).
--
-- Apply:  bun run db:seed:local
-- Reset:  delete the local D1 file, re-run migrations, then re-seed.
--
-- Test accounts
-- ─────────────────────────────────────────────
--   admin@drape.local    password: password123
--   dev@drape.local      password: DevSeed#2026
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
  -- Admin user — verified, ready to sign in immediately
  (
    'seed-user-001',
    'Admin User',
    'admin@drape.local',
    1,
    NULL,
    NULL,
    1704067200000,
    1704067200000
  ),
  -- Dev user — verified
  (
    'seed-user-002',
    'Dev User',
    'dev@drape.local',
    1,
    NULL,
    NULL,
    1706745600000,
    1706745600000
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Accounts (better-auth email/password credential provider)
-- Password hashes use better-auth's scrypt format: "salt:hexkey"
-- (@better-auth/utils → @noble/hashes/scrypt, N=16384 r=16 p=1 dkLen=64)
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
    'admin@drape.local',
    'credential',
    'seed-user-001',
    NULL, NULL, NULL, NULL, NULL, NULL,
    '9ba67f38a6e86578fa723c85a5ecb433:ccd05f0c7711b10b9b7eb765a48d986d29a9fc75eb2b8fcf9c7e965a6652936c2d8cfc9a3b300de4379adf9f1c5e58a03b779f934e67c726881091888a243bae',
    1704067200000,
    1704067200000
  ),
  (
    'seed-account-002',
    'dev@drape.local',
    'credential',
    'seed-user-002',
    NULL, NULL, NULL, NULL, NULL, NULL,
    '3791df60a57db20a17f9ac90438b5b61:065eb9a6eab8f79b642a01a7e6a72b88debecad7456a6c27c986309c6261b192d5540f523790c986b2664e3beac702b9ad50e638cd43d68f7d39d9d919a53835',
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
