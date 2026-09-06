import { describe, expect, it } from "vitest";

import { fetchWorker } from "../fixtures/worker";

describe("rate limiting", () => {
	it("blocks login after its per-IP limit and returns Retry-After", async () => {
		const attempt = () =>
			fetchWorker("/api/v1/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "nobody@example.com",
					password: "wrong-password",
				}),
			});

		// `loginRateLimit` in src/routes/auth.ts allows 10 requests/60s per IP.
		const results: Response[] = [];
		for (let i = 0; i < 11; i++) {
			results.push(await attempt());
		}

		expect(results.slice(0, 10).every((r) => r.status !== 429)).toBe(true);

		const blocked = results[10];
		expect(blocked?.status).toBe(429);
		expect(blocked?.headers.get("Retry-After")).toBeTruthy();
		const body = (await blocked?.json()) as { error: { code: string } };
		expect(body.error.code).toBe("RATE_LIMITED");
	});

	it("does not rate-limit unrelated endpoints under the same low threshold", async () => {
		const res = await fetchWorker("/api/v1/health");
		expect(res.status).toBe(200);
	});
});
