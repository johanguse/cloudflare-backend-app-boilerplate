-- Dev-only seed (run after migrations). Replace passwords / keys before any shared environment.
-- Apply: `bun run db:seed:local`
--
-- Login (once Better Auth email/password is wired in Phase 3): seed@example.com / password123
-- API key secret for local tests: dev_sk_test_key_change_me (hash stored in `key_hash`)

INSERT INTO "user" ("id", "name", "email", "email_verified", "image", "created_at", "updated_at") VALUES
('seed-user-001', 'Seed User', 'seed@example.com', 1, NULL, 1704067200000, 1704067200000);

-- provider_id `credential`, account_id = email (Better Auth email/password convention)
INSERT INTO "account" (
	"id", "account_id", "provider_id", "user_id",
	"access_token", "refresh_token", "id_token",
	"access_token_expires_at", "refresh_token_expires_at", "scope", "password",
	"created_at", "updated_at"
) VALUES (
	'seed-account-001',
	'seed@example.com',
	'credential',
	'seed-user-001',
	NULL, NULL, NULL, NULL, NULL, NULL,
	'$2b$10$T6/RKYy8COA54KlYf5fJZeYLRp6BzYqlb23U4bzjBZ1MchQnpsmbm',
	1704067200000,
	1704067200000
);

INSERT INTO "api_keys" ("id", "user_id", "name", "key_hash", "key_prefix", "last_used_at", "expires_at", "created_at") VALUES (
	'seed-api-key-001',
	'seed-user-001',
	'Local dev key',
	'0ba1ab88de3584c4c183073e0781e90466396f3dd913e559111555b2eb876601',
	'dev_sk_te',
	NULL,
	NULL,
	1704067200000
);
