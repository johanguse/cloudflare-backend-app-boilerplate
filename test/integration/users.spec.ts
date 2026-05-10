import { describe, expect, it } from "vitest";

import { fetchWorker } from "../fixtures/worker";

function jsonHeaders(): HeadersInit {
	return { "Content-Type": "application/json" };
}

describe("users", () => {
	it("GET /api/v1/users/me without auth returns 401", async () => {
		const res = await fetchWorker("/api/v1/users/me");
		expect(res.status).toBe(401);
	});

	it("GET and PATCH /api/v1/users/me with auth", async () => {
		const email = `users-${crypto.randomUUID()}@example.com`;
		const password = "password123";

		const reg = await fetchWorker("/api/v1/auth/register", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				email,
				password,
				name: "Before Patch",
			}),
		});
		expect(reg.status).toBe(200);
		const tokens = (await reg.json()) as {
			data: { accessToken: string | null };
		};
		const accessToken = tokens.data.accessToken;
		expect(accessToken).toBeTruthy();

		const get = await fetchWorker("/api/v1/users/me", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		expect(get.status).toBe(200);
		const profile = (await get.json()) as {
			data: { name: string; email: string };
		};
		expect(profile.data.name).toBe("Before Patch");
		expect(profile.data.email).toBe(email.toLowerCase());

		const patched = await fetchWorker("/api/v1/users/me", {
			method: "PATCH",
			headers: {
				...jsonHeaders(),
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ name: "After Patch" }),
		});
		expect(patched.status).toBe(200);
		const updated = (await patched.json()) as { data: { name: string } };
		expect(updated.data.name).toBe("After Patch");
	});
});
