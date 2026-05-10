import { APIError } from "better-auth";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import type { HonoEnv } from "@/lib/types";

export const globalErrorHandler: ErrorHandler<HonoEnv> = (err, c) => {
	if (err instanceof HTTPException) {
		return err.res
			? err.getResponse()
			: c.json(
					{
						error: {
							code: "HTTP_ERROR",
							message: err.message,
						},
					},
					err.status as ContentfulStatusCode,
				);
	}

	if (err instanceof APIError) {
		const status = (
			typeof err.statusCode === "number" ? err.statusCode : 500
		) as ContentfulStatusCode;
		const body = err.body;
		const code = typeof body?.code === "string" ? body.code : "AUTH_ERROR";
		const message =
			typeof body?.message === "string"
				? body.message
				: (err.message ?? "Authentication error");
		return c.json({ error: { code, message } }, status);
	}

	if (err instanceof ZodError) {
		return c.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Invalid request",
					details: { issueCount: err.issues.length },
				},
			},
			400,
		);
	}

	console.error(err);
	return c.json(
		{
			error: {
				code: "INTERNAL_SERVER_ERROR",
				message: "An unexpected error occurred",
			},
		},
		500,
	);
};
