import { defineConfig } from "drizzle-kit";

/**
 * Local: SQLite file (default `.data/local.sqlite`).
 * Remote D1: set `DRIZZLE_D1_REMOTE=true` plus Cloudflare env vars (see `.env.staging.example`).
 */
const isRemote = process.env.DRIZZLE_D1_REMOTE === "true";
const localDbUrl = process.env.SQLITE_PATH ?? ".data/local.sqlite";

export default defineConfig({
	dialect: "sqlite",
	schema: [
		"./src/db/schema/auth.ts",
		"./src/db/schema/jwks.ts",
		"./src/db/schema/uploads.ts",
		"./src/db/schema/api-keys.ts",
		"./src/db/schema/push-devices.ts",
	],
	out: "./src/db/migrations",
	...(isRemote
		? {
				driver: "d1-http",
				dbCredentials: {
					accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
					databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID ?? "",
					token: process.env.CLOUDFLARE_API_TOKEN ?? "",
				},
			}
		: {
				dbCredentials: {
					url: localDbUrl,
				},
			}),
});
