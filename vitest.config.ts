import path from "node:path";
import {
	defineWorkersConfig,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
	const migrations = await readD1Migrations(
		path.resolve(__dirname, "src/db/migrations"),
	);

	return {
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
			poolOptions: {
				workers: {
					wrangler: { configPath: "./wrangler.jsonc" },
					miniflare: {
						bindings: { TEST_MIGRATIONS: migrations },
					},
				},
			},
			include: ["test/**/*.{test,spec}.ts"],
			exclude: ["node_modules", "dist", ".git"],
			testTimeout: 30_000,
		},
	};
});
