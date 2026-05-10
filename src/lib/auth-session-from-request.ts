import { and, desc, eq, gt } from "drizzle-orm";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";

import { session as sessionTable, user as userTable } from "@/db/schema/auth";
import { jwks } from "@/db/schema/jwks";
import { type AuthInstance, createAuth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { createDb, type Database } from "@/lib/db";

export type AuthSessionBundle = NonNullable<
	Awaited<ReturnType<AuthInstance["api"]["getSession"]>>
>;

async function tryResolveJwtSession(
	env: Env,
	db: Database,
	bearerToken: string,
): Promise<AuthSessionBundle | null> {
	if (bearerToken.split(".").length !== 3) {
		return null;
	}

	let header: ReturnType<typeof decodeProtectedHeader>;
	try {
		header = decodeProtectedHeader(bearerToken);
	} catch {
		return null;
	}

	const kid = header.kid;
	const alg = header.alg;
	if (typeof kid !== "string" || typeof alg !== "string") {
		return null;
	}

	const [jwkRow] = await db
		.select()
		.from(jwks)
		.where(eq(jwks.id, kid))
		.limit(1);
	if (!jwkRow) {
		return null;
	}

	let key: Awaited<ReturnType<typeof importJWK>>;
	try {
		key = await importJWK(JSON.parse(jwkRow.publicKey), alg);
	} catch {
		return null;
	}

	const config = getConfig(env);
	const base = config.baseUrl;

	let sub: string;
	try {
		const { payload } = await jwtVerify(bearerToken, key, {
			issuer: base,
			audience: base,
		});
		if (typeof payload.sub !== "string" || payload.sub.length === 0) {
			return null;
		}
		sub = payload.sub;
	} catch {
		return null;
	}

	const now = new Date();

	const [sessRow] = await db
		.select()
		.from(sessionTable)
		.where(and(eq(sessionTable.userId, sub), gt(sessionTable.expiresAt, now)))
		.orderBy(desc(sessionTable.updatedAt))
		.limit(1);

	if (!sessRow) {
		return null;
	}

	const [urow] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.id, sub))
		.limit(1);

	if (!urow || urow.deletedAt) {
		return null;
	}

	return {
		user: {
			id: urow.id,
			name: urow.name,
			email: urow.email,
			emailVerified: urow.emailVerified,
			image: urow.image,
			createdAt: urow.createdAt,
			updatedAt: urow.updatedAt,
		},
		session: {
			id: sessRow.id,
			userId: sessRow.userId,
			token: sessRow.token,
			expiresAt: sessRow.expiresAt,
			createdAt: sessRow.createdAt,
			updatedAt: sessRow.updatedAt,
			ipAddress: sessRow.ipAddress,
			userAgent: sessRow.userAgent,
		},
	};
}

/**
 * Better Auth `auth.api.*` handlers expect the opaque session token in `Authorization` or cookies.
 * JWT access tokens are accepted by our middleware but do not flow through the default bearer hook.
 */
export function headersWithSessionBearer(
	original: Headers,
	sessionToken: string,
): Headers {
	const headers = new Headers(original);
	headers.set("Authorization", `Bearer ${sessionToken}`);
	return headers;
}

/**
 * Resolves a Better Auth session from request headers.
 * Supports the opaque session token and JWT access tokens (Better Auth `jwt` + `bearer` plugins:
 * the default bearer hook does not treat JWTs as session cookies).
 */
export async function getSessionFromHeaders(
	env: Env,
	headers: Headers,
): Promise<AuthSessionBundle | null> {
	const db = createDb(env.DB);
	const auth = createAuth(env, db);

	const fromBetterAuth = await auth.api.getSession({ headers });
	if (fromBetterAuth) {
		return fromBetterAuth;
	}

	const raw = headers.get("Authorization") ?? headers.get("authorization");
	if (!raw?.toLowerCase().startsWith("bearer ")) {
		return null;
	}
	const token = raw.slice(7).trim();
	if (token.length === 0) {
		return null;
	}

	return tryResolveJwtSession(env, db, token);
}
