import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";

import { createAuth } from "@/lib/auth";
import { createDb } from "@/lib/db";
import { rateLimiter } from "@/lib/rate-limit";
import { cleanupExpiredAuthRows } from "@/lib/session-cleanup";
import type { HonoEnv } from "@/lib/types";
import { corsMiddleware } from "@/middlewares/cors";
import { globalErrorHandler } from "@/middlewares/error";
import { analysisRoutes } from "@/routes/analyses";
import { apiKeyRoutes } from "@/routes/api-keys";
import { authRoutes } from "@/routes/auth";
import { chatRoutes } from "@/routes/chat";
import { healthRoutes } from "@/routes/health";
import { uploadRoutes } from "@/routes/uploads";
import { userRoutes } from "@/routes/users";

const app = new Hono<HonoEnv>();

app.onError(globalErrorHandler);

app.use("*", corsMiddleware);

/** Baseline abuse protection, per IP. Individual routes (auth, chat, analyses) layer tighter limits on top. */
app.use(
	"/api/v1/*",
	rateLimiter({ limit: 300, windowSeconds: 60, keyPrefix: "api" }),
);

app.route("/", healthRoutes);

app.route("/api/v1/auth", authRoutes);

app.route("/api/v1/users", userRoutes);

app.route("/api/v1/uploads", uploadRoutes);

app.route("/api/v1/analyses", analysisRoutes);

app.route("/api/v1/chat", chatRoutes);

app.route("/api/v1/api-keys", apiKeyRoutes);

app.all("/api/auth/*", async (c) => {
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	return auth.handler(c.req.raw);
});

app.get("/api/v1/health", (c) =>
	c.json({
		data: {
			status: "ok" as const,
			version: "0.1.0",
			timestamp: new Date().toISOString(),
			environment: c.env.ENVIRONMENT,
		},
	}),
);

const handler = {
	fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
		app.fetch(request, env, ctx),
	async scheduled(
		_event: ScheduledController,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<void> {
		try {
			const { sessionsDeleted, verificationsDeleted } =
				await cleanupExpiredAuthRows(env);
			console.info(
				`cron ${env.ENVIRONMENT}: removed ${sessionsDeleted} expired sessions, ${verificationsDeleted} expired verification rows`,
			);
		} catch (err) {
			console.error(`cron ${env.ENVIRONMENT}: cleanup failed`, err);
		}
	},
} satisfies ExportedHandler<Env>;

export default Sentry.withSentry(
	(env: Env) => ({
		dsn: env.SENTRY_DSN,
		enabled: Boolean(env.SENTRY_DSN),
		environment: env.ENVIRONMENT,
		tracesSampleRate: env.ENVIRONMENT === "production" ? 0.1 : 1.0,
	}),
	handler,
);
