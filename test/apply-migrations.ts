/// <reference types="@cloudflare/vitest-pool-workers" />

import { applyD1Migrations, env } from "cloudflare:test";

// better-auth's internal endpoint wrapper (to-auth-endpoints.mjs) fires a
// secondary Promise rejection alongside the main chain when an API call fails.
// Our route handlers catch the main rejection via settleBetterAuthPromise, but
// the secondary echo is unreachable from user code. Suppress it here so Vitest
// doesn't report false-positive unhandled-rejection errors.
globalThis.addEventListener("unhandledrejection", (event) => {
	const r = event.reason as Record<string, unknown> | null | undefined;
	if (r && typeof r.statusCode === "number" && typeof r.body === "object") {
		event.preventDefault();
	}
});

const migrations = env.TEST_MIGRATIONS;
if (!migrations) {
	throw new Error(
		"TEST_MIGRATIONS binding missing (see vitest.config.ts miniflare.bindings)",
	);
}
await applyD1Migrations(env.DB, migrations);
