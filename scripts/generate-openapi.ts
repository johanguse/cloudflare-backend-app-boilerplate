/**
 * Generates an OpenAPI 3.1 document from the Hono routes in `src/routes/*`.
 *
 * Request bodies are derived from the zod schemas in `src/lib/schemas.ts`
 * (via `zod-to-json-schema`), which are the same schemas the routes validate
 * against — the spec can't drift from what the API actually accepts. Routes
 * here are plain Hono handlers (no `@hono/zod-openapi`), so paths, methods,
 * tags and response shapes are declared in the registry below and kept in
 * sync by hand when routes change.
 *
 * Usage: `bun run openapi:generate` -> writes `docs/openapi.json`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type * as z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
	appleBody,
	authChangePasswordBody,
	chatBody,
	createAnalysisBody,
	createKeyBody,
	deviceRegisterBody,
	forgotPasswordBody,
	googleNativeBody,
	jsonUploadBody,
	loginBody,
	patchMeBody,
	refreshBody,
	registerBody,
	resetPasswordBody,
	userChangePasswordBody,
	verifyEmailBody,
} from "@/lib/schemas";

const OUT_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../docs/openapi.json",
);

type Auth = "none" | "bearer";

interface RouteDoc {
	method: "get" | "post" | "patch" | "delete";
	path: string;
	tag: string;
	summary: string;
	auth: Auth;
	requestBody?: z.ZodType;
	successDescription: string;
}

/** Generic success/error envelope — every route replies `{ data }` or `{ error }`. */
function genericResponse(description: string) {
	return {
		description,
		content: {
			"application/json": {
				schema: {
					type: "object",
					properties: {
						data: {},
					},
				},
			},
		},
	} as const;
}

const errorResponse = {
	description: "Structured error",
	content: {
		"application/json": {
			schema: {
				type: "object",
				properties: {
					error: {
						type: "object",
						properties: {
							code: { type: "string" },
							message: { type: "string" },
							details: {},
						},
						required: ["code", "message"],
					},
				},
				required: ["error"],
			},
		},
	},
} as const;

const routes: RouteDoc[] = [
	// Health
	{
		method: "get",
		path: "/health",
		tag: "Health",
		summary: "Liveness check",
		auth: "none",
		successDescription: "Worker is running",
	},
	{
		method: "get",
		path: "/api/v1/health",
		tag: "Health",
		summary: "Liveness check (versioned)",
		auth: "none",
		successDescription: "Worker is running",
	},
	{
		method: "get",
		path: "/health/db",
		tag: "Health",
		summary: "D1 connectivity check",
		auth: "none",
		successDescription: "Database is reachable",
	},

	// Auth
	{
		method: "post",
		path: "/api/v1/auth/register",
		tag: "Auth",
		summary: "Register with email + password",
		auth: "none",
		requestBody: registerBody,
		successDescription:
			"User created; tokens issued when email/password sign-up completes immediately",
	},
	{
		method: "post",
		path: "/api/v1/auth/login",
		tag: "Auth",
		summary: "Log in with email + password",
		auth: "none",
		requestBody: loginBody,
		successDescription: "User + access/refresh tokens",
	},
	{
		method: "post",
		path: "/api/v1/auth/logout",
		tag: "Auth",
		summary: "Revoke the current session",
		auth: "bearer",
		successDescription: "Session revoked",
	},
	{
		method: "post",
		path: "/api/v1/auth/refresh",
		tag: "Auth",
		summary: "Exchange a refresh token for a new access/refresh pair",
		auth: "none",
		requestBody: refreshBody,
		successDescription: "New access/refresh tokens",
	},
	{
		method: "post",
		path: "/api/v1/auth/verify-email",
		tag: "Auth",
		summary: "Verify an email address with a token",
		auth: "none",
		requestBody: verifyEmailBody,
		successDescription: "Verification status + user",
	},
	{
		method: "post",
		path: "/api/v1/auth/resend-verification",
		tag: "Auth",
		summary: "Resend the verification email",
		auth: "none",
		requestBody: forgotPasswordBody,
		successDescription: "Email sent when the account exists",
	},
	{
		method: "post",
		path: "/api/v1/auth/forgot-password",
		tag: "Auth",
		summary: "Request a password reset email",
		auth: "none",
		requestBody: forgotPasswordBody,
		successDescription: "Reset email sent when the account exists",
	},
	{
		method: "post",
		path: "/api/v1/auth/reset-password",
		tag: "Auth",
		summary: "Reset a password with a reset token",
		auth: "none",
		requestBody: resetPasswordBody,
		successDescription: "Password reset status",
	},
	{
		method: "get",
		path: "/api/v1/auth/google",
		tag: "Auth",
		summary: "Start the Google OAuth browser flow",
		auth: "none",
		successDescription: "Authorization URL to redirect the browser to",
	},
	{
		method: "post",
		path: "/api/v1/auth/google",
		tag: "Auth",
		summary: "Sign in with Google (native ID token)",
		auth: "none",
		requestBody: googleNativeBody,
		successDescription: "User + access/refresh tokens",
	},
	{
		method: "post",
		path: "/api/v1/auth/apple",
		tag: "Auth",
		summary: "Sign in with Apple (native identity token)",
		auth: "none",
		requestBody: appleBody,
		successDescription: "User + access/refresh tokens",
	},
	{
		method: "post",
		path: "/api/v1/auth/change-password",
		tag: "Auth",
		summary: "Change the signed-in user's password",
		auth: "bearer",
		requestBody: authChangePasswordBody,
		successDescription: "Password changed",
	},

	// Users
	{
		method: "get",
		path: "/api/v1/users/me",
		tag: "Users",
		summary: "Get the current user's profile",
		auth: "bearer",
		successDescription: "User profile",
	},
	{
		method: "patch",
		path: "/api/v1/users/me",
		tag: "Users",
		summary: "Update the current user's profile",
		auth: "bearer",
		requestBody: patchMeBody,
		successDescription: "Updated user profile",
	},
	{
		method: "delete",
		path: "/api/v1/users/me",
		tag: "Users",
		summary: "Soft-delete the current user's account",
		auth: "bearer",
		successDescription: "Account deleted",
	},
	{
		method: "post",
		path: "/api/v1/users/me/change-password",
		tag: "Users",
		summary: "Change the current user's password",
		auth: "bearer",
		requestBody: userChangePasswordBody,
		successDescription: "Password updated",
	},
	{
		method: "post",
		path: "/api/v1/users/me/avatar",
		tag: "Users",
		summary: "Upload a profile avatar (multipart/form-data, field `file`)",
		auth: "bearer",
		successDescription: "Updated user profile with new avatar URL",
	},
	{
		method: "delete",
		path: "/api/v1/users/me/avatar",
		tag: "Users",
		summary: "Remove the current user's avatar",
		auth: "bearer",
		successDescription: "Avatar removed",
	},
	{
		method: "post",
		path: "/api/v1/users/me/devices",
		tag: "Users",
		summary: "Register a push notification device token",
		auth: "bearer",
		requestBody: deviceRegisterBody,
		successDescription: "Device token registered or updated",
	},
	{
		method: "delete",
		path: "/api/v1/users/me/devices/{token}",
		tag: "Users",
		summary: "Unregister a push notification device token",
		auth: "bearer",
		successDescription: "Device token removed",
	},

	// Uploads
	{
		method: "post",
		path: "/api/v1/uploads",
		tag: "Uploads",
		summary:
			"Upload a file to R2 (multipart/form-data field `file`, or JSON base64)",
		auth: "bearer",
		requestBody: jsonUploadBody,
		successDescription:
			"Stored object key, URL (if public), size and MIME type",
	},
	{
		method: "get",
		path: "/api/v1/uploads/{key}/url",
		tag: "Uploads",
		summary: "Get a time-limited URL for a private upload",
		auth: "bearer",
		successDescription: "Signed/public URL and expiry",
	},
	{
		method: "delete",
		path: "/api/v1/uploads/{key}",
		tag: "Uploads",
		summary: "Delete an uploaded file",
		auth: "bearer",
		successDescription: "File deleted",
	},

	// API keys
	{
		method: "get",
		path: "/api/v1/api-keys",
		tag: "API Keys",
		summary: "List the current user's API keys",
		auth: "bearer",
		successDescription: "API keys (prefix only, no secret)",
	},
	{
		method: "post",
		path: "/api/v1/api-keys",
		tag: "API Keys",
		summary: "Create an API key",
		auth: "bearer",
		requestBody: createKeyBody,
		successDescription: "The full secret — shown once",
	},
	{
		method: "delete",
		path: "/api/v1/api-keys/{id}",
		tag: "API Keys",
		summary: "Revoke an API key",
		auth: "bearer",
		successDescription: "API key revoked",
	},

	// Analyses
	{
		method: "post",
		path: "/api/v1/analyses",
		tag: "Analyses",
		summary: "Run an AI style/photo analysis on a previously uploaded photo",
		auth: "bearer",
		requestBody: createAnalysisBody,
		successDescription: "Analysis result",
	},
	{
		method: "get",
		path: "/api/v1/analyses/history",
		tag: "Analyses",
		summary: "List the current user's past analyses",
		auth: "bearer",
		successDescription: "Analysis history",
	},

	// Chat
	{
		method: "post",
		path: "/api/v1/chat/stream",
		tag: "Chat",
		summary: "Stream a chat completion from Workers AI (Server-Sent Events)",
		auth: "bearer",
		requestBody: chatBody,
		successDescription:
			'`text/event-stream` of `data: {"response": "..."}` frames, terminated by `data: [DONE]`',
	},
];

function toSchema(schema: z.ZodType) {
	// `effectStrategy: "input"` documents the pre-effect shape (e.g.
	// `patchMeBody`'s trim/"" -> null transforms and top-level `.refine`)
	// since JSON Schema can't express a transform or a cross-field refinement.
	const json = zodToJsonSchema(schema, {
		target: "jsonSchema7",
		effectStrategy: "input",
	}) as Record<string, unknown>;
	delete json.$schema;
	return json;
}

function buildPaths() {
	const paths: Record<string, Record<string, unknown>> = {};

	for (const route of routes) {
		paths[route.path] ??= {};
		const operation: Record<string, unknown> = {
			tags: [route.tag],
			summary: route.summary,
			responses: {
				"200": genericResponse(route.successDescription),
				"400": errorResponse,
				...(route.auth === "bearer" ? { "401": errorResponse } : {}),
			},
		};
		if (route.auth === "bearer") {
			operation.security = [{ bearerAuth: [] }];
		}
		if (route.requestBody) {
			operation.requestBody = {
				required: true,
				content: {
					"application/json": {
						schema: toSchema(route.requestBody),
					},
				},
			};
		}
		const params = [...route.path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
			name: m[1],
			in: "path",
			required: true,
			schema: { type: "string" },
		}));
		if (params.length > 0) {
			operation.parameters = params;
		}
		paths[route.path][route.method] = operation;
	}

	return paths;
}

async function main() {
	const document = {
		openapi: "3.1.0",
		info: {
			title: "Cloudflare Backend Boilerplate API",
			version: "0.1.0",
			description:
				"API-only Cloudflare Worker (Hono) for mobile clients. Generated from src/routes/* and src/lib/schemas.ts — see scripts/generate-openapi.ts.",
		},
		servers: [{ url: "http://127.0.0.1:8787", description: "Local dev" }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
					description:
						"Better Auth JWT access token (15m). Also accepts an opaque session/API token on some routes — see docs/README.",
				},
			},
		},
		tags: [
			{ name: "Health" },
			{ name: "Auth" },
			{ name: "Users" },
			{ name: "Uploads" },
			{ name: "API Keys" },
			{ name: "Analyses" },
			{ name: "Chat" },
		],
		paths: buildPaths(),
	};

	await mkdir(dirname(OUT_PATH), { recursive: true });
	await writeFile(OUT_PATH, `${JSON.stringify(document, null, "\t")}\n`);
	console.log(`Wrote ${routes.length} operations to ${OUT_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
