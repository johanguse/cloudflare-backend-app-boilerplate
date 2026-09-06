import * as Sentry from "@sentry/cloudflare";
import { APIError } from "better-auth";
import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { MSG } from "@/lib/messages";
import type { HonoEnv } from "@/lib/types";

/**
 * Converts a caught unknown value into a typed JSON error response.
 * Use this inside route handlers when you catch an error manually
 * (e.g. via settleBetterAuthPromise) and need to return a response
 * without re-throwing into Hono's global error handler.
 */
export function resolveAppError(err: unknown, c: Context<HonoEnv>): Response {
	if (err instanceof HTTPException) {
		return err.res
			? err.getResponse()
			: c.json(
					{
						error: {
							code: "HTTP_ERROR",
							message: err.message || MSG.generic.badRequest,
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
		const message = mapBetterAuthCode(code, body?.message ?? err.message);
		return c.json({ error: { code, message } }, status);
	}

	if (err instanceof ZodError) {
		return c.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: MSG.generic.validationFailed,
					details: { issueCount: err.issues.length },
				},
			},
			400,
		);
	}

	// Only truly unexpected errors reach here — expected ones (validation, auth,
	// HTTPException) are handled above and shouldn't spam error tracking.
	Sentry.captureException(err);
	console.error(err);
	return c.json(
		{
			error: {
				code: "INTERNAL_SERVER_ERROR",
				message: MSG.generic.internalError,
			},
		},
		500,
	);
}

export const globalErrorHandler: ErrorHandler<HonoEnv> = (err, c) =>
	resolveAppError(err, c);

function mapBetterAuthCode(code: string, fallback?: string): string {
	switch (code) {
		case "INVALID_EMAIL_OR_PASSWORD":
		case "INVALID_CREDENTIALS":
		case "INVALID_PASSWORD":
			return MSG.auth.invalidCredentials;
		case "EMAIL_NOT_VERIFIED":
			return MSG.auth.emailNotVerified;
		case "USER_ALREADY_EXISTS":
		case "EMAIL_ALREADY_EXISTS":
			return MSG.auth.emailAlreadyExists;
		case "INVALID_TOKEN":
		case "RESET_PASSWORD_TOKEN_NOT_FOUND":
			return MSG.auth.invalidResetToken;
		case "PASSWORD_TOO_SHORT":
			return MSG.auth.passwordTooShort;
		case "UNAUTHORIZED":
			return MSG.auth.unauthorized;
		case "RATE_LIMIT_EXCEEDED":
			return MSG.generic.rateLimited;
		default:
			return typeof fallback === "string" && fallback.length > 0
				? fallback
				: MSG.generic.internalError;
	}
}
