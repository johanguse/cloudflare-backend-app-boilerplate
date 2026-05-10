/// <reference types="@cloudflare/vitest-pool-workers" />

import { applyD1Migrations, env } from "cloudflare:test";

const migrations = env.TEST_MIGRATIONS;
if (!migrations) {
	throw new Error(
		"TEST_MIGRATIONS binding missing (see vitest.config.ts miniflare.bindings)",
	);
}
await applyD1Migrations(env.DB, migrations);
