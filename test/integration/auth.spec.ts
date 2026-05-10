import { describe, expect, it } from "vitest";

import { fetchWorker } from "../fixtures/worker";

function jsonHeaders(): HeadersInit {
	return { "Content-Type": "application/json" };
}

describe("auth", () => {
	it("register, refresh, logout clears session", async () => {
		const email = `auth-${crypto.randomUUID()}@example.com`;
		const password = "password123";
		const name = "Auth Tester";

		const reg = await fetchWorker("/api/v1/auth/register", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({ email, password, name }),
		});
		expect(reg.status).toBe(200);
		const regBody = (await reg.json()) as {
			data: {
				user: { email: string };
				accessToken: string | null;
				refreshToken: string | null;
			};
		};
		expect(regBody.data.user.email).toBe(email.toLowerCase());
		expect(regBody.data.accessToken).toBeTruthy();
		expect(regBody.data.refreshToken).toBeTruthy();

		const refreshToken = regBody.data.refreshToken as string;
		const accessAfterRegister = regBody.data.accessToken as string;

		const refresh = await fetchWorker("/api/v1/auth/refresh", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({ refreshToken }),
		});
		expect(refresh.status).toBe(200);
		const refreshBody = (await refresh.json()) as {
			data: { accessToken: string; refreshToken: string };
		};
		expect(refreshBody.data.accessToken.length).toBeGreaterThan(0);
		expect(refreshBody.data.refreshToken).toBe(refreshToken);

		const meOk = await fetchWorker("/api/v1/users/me", {
			headers: { Authorization: `Bearer ${refreshBody.data.accessToken}` },
		});
		expect(meOk.status).toBe(200);

		const logout = await fetchWorker("/api/v1/auth/logout", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${refreshBody.data.accessToken}`,
			},
		});
		expect(logout.status).toBe(200);

		const meAfterLogout = await fetchWorker("/api/v1/users/me", {
			headers: {
				Authorization: `Bearer ${refreshBody.data.accessToken}`,
			},
		});
		expect(meAfterLogout.status).toBe(401);

		const meOldJwt = await fetchWorker("/api/v1/users/me", {
			headers: { Authorization: `Bearer ${accessAfterRegister}` },
		});
		expect(meOldJwt.status).toBe(401);
	});

	it("login succeeds after register", async () => {
		const email = `login-${crypto.randomUUID()}@example.com`;
		const password = "password123";

		await fetchWorker("/api/v1/auth/register", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				email,
				password,
				name: "Login Tester",
			}),
		});

		const login = await fetchWorker("/api/v1/auth/login", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({ email, password }),
		});
		expect(login.status).toBe(200);
		const body = (await login.json()) as {
			data: { accessToken: string; refreshToken: string };
		};
		expect(body.data.accessToken.length).toBeGreaterThan(0);
		expect(body.data.refreshToken.length).toBeGreaterThan(0);
	});

	it("returns 401 for invalid bearer on /api/v1/users/me", async () => {
		const res = await fetchWorker("/api/v1/users/me", {
			headers: { Authorization: "Bearer totally-invalid-token" },
		});
		expect(res.status).toBe(401);
	});
});
