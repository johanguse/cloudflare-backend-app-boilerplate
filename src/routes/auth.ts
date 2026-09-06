import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as z from "zod";

import { createAuth } from "@/lib/auth";
import {
	getSessionFromHeaders,
	headersWithSessionBearer,
} from "@/lib/auth-session-from-request";
import { issueAccessToken } from "@/lib/auth-tokens";
import { createDb } from "@/lib/db";
import { MSG } from "@/lib/messages";
import { rateLimiter } from "@/lib/rate-limit";
import {
	appleBody,
	authChangePasswordBody as changePasswordBody,
	forgotPasswordBody,
	googleNativeBody,
	loginBody,
	refreshBody,
	registerBody,
	resetPasswordBody,
	verifyEmailBody,
} from "@/lib/schemas";
import type { HonoEnv } from "@/lib/types";
import { requireBearerAuth } from "@/middlewares/auth";
import { resolveAppError } from "@/middlewares/error";

function settleBetterAuthPromise<T>(
	promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
	return promise.then(
		(value) => ({ ok: true as const, value }),
		(error: unknown) => ({ ok: false as const, error }),
	);
}

async function readJson<T>(
	c: { req: { json: () => Promise<unknown> } },
	schema: z.ZodType<T>,
): Promise<T> {
	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		throw new HTTPException(400, { message: "Invalid JSON body" });
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		throw parsed.error;
	}
	return parsed.data;
}

export const authRoutes = new Hono<HonoEnv>();

/** IP-based (no session yet): guards against credential stuffing / signup spam. */
const loginRateLimit = rateLimiter({
	limit: 10,
	windowSeconds: 60,
	keyPrefix: "auth:login",
});
const registerRateLimit = rateLimiter({
	limit: 5,
	windowSeconds: 3600,
	keyPrefix: "auth:register",
});
/** Shared across forgot/reset/resend — all three send email, so they share one budget. */
const emailActionRateLimit = rateLimiter({
	limit: 5,
	windowSeconds: 3600,
	keyPrefix: "auth:email",
});

authRoutes.post("/register", registerRateLimit, async (c) => {
	const body = await readJson(c, registerBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const signUp = await auth.api.signUpEmail({
		body: {
			email: body.email,
			password: body.password,
			name: body.name,
		},
		headers: c.req.raw.headers,
	});
	if (!signUp.token) {
		return c.json({
			data: {
				user: signUp.user,
				accessToken: null,
				refreshToken: null,
			},
		});
	}
	const tokens = await issueAccessToken(auth, signUp.token);
	return c.json({
		data: {
			user: signUp.user,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
		},
	});
});

authRoutes.post("/login", loginRateLimit, async (c) => {
	const body = await readJson(c, loginBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const signInResult = await settleBetterAuthPromise(
		auth.api.signInEmail({
			body: { email: body.email, password: body.password },
			headers: c.req.raw.headers,
		}),
	);
	if (!signInResult.ok) {
		return resolveAppError(signInResult.error, c);
	}
	const tokens = await issueAccessToken(auth, signInResult.value.token);
	return c.json({
		data: {
			user: signInResult.value.user,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
		},
	});
});

authRoutes.post("/logout", async (c) => {
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Missing or invalid Authorization header",
				},
			},
			401,
		);
	}

	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const session = await getSessionFromHeaders(c.env, c.req.raw.headers);
	if (!session?.session?.token) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Invalid or expired session",
				},
			},
			401,
		);
	}

	await auth.api.revokeSession({
		headers: headersWithSessionBearer(c.req.raw.headers, session.session.token),
		body: { token: session.session.token },
	});

	return c.json({ data: { ok: true as const } });
});

authRoutes.post("/refresh", async (c) => {
	const body = await readJson(c, refreshBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const tokens = await issueAccessToken(auth, body.refreshToken);
	return c.json({ data: tokens });
});

authRoutes.post("/verify-email", async (c) => {
	const body = await readJson(c, verifyEmailBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const result = await auth.api.verifyEmail({
		query: { token: body.token },
		headers: c.req.raw.headers,
	});
	const verified =
		!!result &&
		typeof result === "object" &&
		"status" in result &&
		result.status === true;
	const user =
		result &&
		typeof result === "object" &&
		"user" in result &&
		result.user !== undefined &&
		result.user !== null
			? result.user
			: null;
	return c.json({
		data: {
			status: verified,
			user,
		},
	});
});

authRoutes.post("/resend-verification", emailActionRateLimit, async (c) => {
	const body = await readJson(c, forgotPasswordBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	await auth.api.sendVerificationEmail({
		body: { email: body.email },
		headers: c.req.raw.headers,
	});
	return c.json({
		data: {
			success: true as const,
			message: "Verification email sent when the account exists",
		},
	});
});

authRoutes.post("/forgot-password", emailActionRateLimit, async (c) => {
	const body = await readJson(c, forgotPasswordBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const result = await auth.api.requestPasswordReset({
		body: { email: body.email },
		headers: c.req.raw.headers,
	});
	return c.json({
		data: {
			status: result.status === true,
			message: result.message,
		},
	});
});

authRoutes.post("/reset-password", emailActionRateLimit, async (c) => {
	const body = await readJson(c, resetPasswordBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const result = await auth.api.resetPassword({
		body: { token: body.token, newPassword: body.newPassword },
		headers: c.req.raw.headers,
	});
	return c.json({ data: { status: result.status === true } });
});

authRoutes.get("/google", async (c) => {
	const callbackURLRaw = c.req.query("callbackURL");
	let callbackURL: string | undefined;
	if (callbackURLRaw) {
		const parsed = z.string().min(1).safeParse(callbackURLRaw);
		if (!parsed.success) {
			throw parsed.error;
		}
		callbackURL = parsed.data;
	}

	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);

	const started = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL,
			disableRedirect: true,
		},
		headers: c.req.raw.headers,
	});

	if (!started.url) {
		return c.json(
			{
				error: {
					code: "OAUTH_NOT_AVAILABLE",
					message:
						"Google sign-in is not configured or did not return an authorization URL",
				},
			},
			503,
		);
	}

	return c.json({
		data: {
			url: started.url,
			provider: "google" as const,
		},
	});
});

authRoutes.post("/google", async (c) => {
	const body = await readJson(c, googleNativeBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);

	const social = await auth.api.signInSocial({
		body: {
			provider: "google",
			idToken: {
				token: body.idToken,
				nonce: body.nonce,
				accessToken: body.accessToken,
			},
		},
		headers: c.req.raw.headers,
	});

	if (!("token" in social) || typeof social.token !== "string") {
		return c.json(
			{
				error: {
					code: "OAUTH_ERROR",
					message: "Google sign-in did not return a session",
				},
			},
			400,
		);
	}

	const tokens = await issueAccessToken(auth, social.token);
	return c.json({
		data: {
			user: social.user,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
		},
	});
});

authRoutes.post("/change-password", requireBearerAuth, async (c) => {
	const body = await readJson(c, changePasswordBody);
	const session = c.get("session");
	if (!session?.token) {
		return c.json(
			{ error: { code: "UNAUTHORIZED", message: MSG.auth.unauthorized } },
			401,
		);
	}
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const result = await settleBetterAuthPromise(
		auth.api.changePassword({
			body: {
				currentPassword: body.currentPassword,
				newPassword: body.newPassword,
				revokeOtherSessions: false,
			},
			headers: headersWithSessionBearer(c.req.raw.headers, session.token),
		}),
	);
	if (!result.ok) {
		return resolveAppError(result.error, c);
	}
	return c.json({
		data: { ok: true as const, message: MSG.auth.passwordChanged },
	});
});

authRoutes.post("/apple", async (c) => {
	const body = await readJson(c, appleBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);

	const social = await auth.api.signInSocial({
		body: {
			provider: "apple",
			idToken: {
				token: body.identityToken,
				accessToken: body.authorizationCode,
				user: body.fullName
					? {
							name: {
								firstName: body.fullName.givenName,
								lastName: body.fullName.familyName,
							},
						}
					: undefined,
			},
		},
		headers: c.req.raw.headers,
	});

	if (!("token" in social) || typeof social.token !== "string") {
		return c.json(
			{
				error: {
					code: "OAUTH_ERROR",
					message: "Apple sign-in did not return a session",
				},
			},
			400,
		);
	}

	const tokens = await issueAccessToken(auth, social.token);
	return c.json({
		data: {
			user: social.user,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
		},
	});
});
