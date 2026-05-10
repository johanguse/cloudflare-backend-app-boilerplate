import { APIError } from "better-auth";

import type { AuthInstance } from "@/lib/auth";

function bearerHeaders(sessionToken: string): Headers {
	const headers = new Headers();
	headers.set("Authorization", `Bearer ${sessionToken}`);
	return headers;
}

/**
 * Issues a short-lived JWT (`accessToken`) for the given Better Auth session token (`refreshToken`).
 */
export async function issueAccessToken(
	auth: AuthInstance,
	sessionToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
	const jwtRes = await auth.api.getToken({
		headers: bearerHeaders(sessionToken),
	});
	const accessToken = jwtRes?.token;
	if (typeof accessToken !== "string" || accessToken.length === 0) {
		throw APIError.from("INTERNAL_SERVER_ERROR", {
			code: "TOKEN_ISSUE_FAILED",
			message: "Failed to issue access token",
		});
	}
	return { accessToken, refreshToken: sessionToken };
}
