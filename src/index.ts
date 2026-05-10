import { Hono } from "hono";

import { createAuth } from "@/lib/auth";
import { createDb } from "@/lib/db";
import { cleanupExpiredAuthRows } from "@/lib/session-cleanup";
import type { HonoEnv } from "@/lib/types";
import { corsMiddleware } from "@/middlewares/cors";
import { globalErrorHandler } from "@/middlewares/error";
import { apiKeyRoutes } from "@/routes/api-keys";
import { authRoutes } from "@/routes/auth";
import { healthRoutes } from "@/routes/health";
import { uploadRoutes } from "@/routes/uploads";
import { userRoutes } from "@/routes/users";

const app = new Hono<HonoEnv>();

app.onError(globalErrorHandler);

app.use("*", corsMiddleware);

app.route("/", healthRoutes);

app.route("/api/v1/auth", authRoutes);

app.route("/api/v1/users", userRoutes);

app.route("/api/v1/uploads", uploadRoutes);

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

export default {
	fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
		app.fetch(request, env, ctx),
	async scheduled(
		_event: ScheduledEvent,
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
};
