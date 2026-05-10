import { describe, expect, it } from "vitest";

import { fetchWorker } from "../fixtures/worker";

describe("health", () => {
	it("GET /health returns ok payload", async () => {
		const res = await fetchWorker("/health");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: { status: string; version: string; environment: string };
		};
		expect(body.data.status).toBe("ok");
		expect(body.data.version).toBe("0.1.0");
		expect(typeof body.data.environment).toBe("string");
	});

	it("GET /api/v1/health returns ok payload", async () => {
		const res = await fetchWorker("/api/v1/health");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { status: string } };
		expect(body.data.status).toBe("ok");
	});

	it("GET /health/db reports database reachable", async () => {
		const res = await fetchWorker("/health/db");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			data: { status: string; database: string };
		};
		expect(body.data.status).toBe("ok");
		expect(body.data.database).toBe("reachable");
	});
});
