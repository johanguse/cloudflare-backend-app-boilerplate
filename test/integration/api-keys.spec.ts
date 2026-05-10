import { describe, expect, it } from "vitest";

import { fetchWorker } from "../fixtures/worker";

function jsonHeaders(): HeadersInit {
	return { "Content-Type": "application/json" };
}

describe("api-keys", () => {
	it("creates, lists, and deletes API keys via bearer auth", async () => {
		const email = `keys-${crypto.randomUUID()}@example.com`;
		const password = "password123";

		const reg = await fetchWorker("/api/v1/auth/register", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				email,
				password,
				name: "Key Tester",
			}),
		});
		expect(reg.status).toBe(200);
		const { data: tokens } = (await reg.json()) as {
			data: { accessToken: string | null };
		};
		const accessToken = tokens.accessToken as string;

		const auth = { Authorization: `Bearer ${accessToken}` };

		const listEmpty = await fetchWorker("/api/v1/api-keys", {
			headers: auth,
		});
		expect(listEmpty.status).toBe(200);
		const emptyBody = (await listEmpty.json()) as { data: unknown[] };
		expect(Array.isArray(emptyBody.data)).toBe(true);

		const create = await fetchWorker("/api/v1/api-keys", {
			method: "POST",
			headers: { ...jsonHeaders(), ...auth },
			body: JSON.stringify({ name: "Integration key" }),
		});
		expect(create.status).toBe(200);
		const created = (await create.json()) as {
			data: { id: string; key: string; keyPrefix: string; name: string };
		};
		expect(created.data.name).toBe("Integration key");
		expect(created.data.key.startsWith("sk_")).toBe(true);
		expect(created.data.keyPrefix.length).toBeGreaterThan(0);
		expect(created.data.key.length).toBeGreaterThan(
			created.data.keyPrefix.length,
		);

		const list = await fetchWorker("/api/v1/api-keys", {
			headers: auth,
		});
		expect(list.status).toBe(200);
		const listBody = (await list.json()) as {
			data: Array<{ id: string; name: string; keyPrefix: string }>;
		};
		expect(listBody.data.length).toBe(1);
		expect(listBody.data[0]?.id).toBe(created.data.id);
		expect(listBody.data[0]?.keyPrefix).toBe(created.data.keyPrefix);
		expect(JSON.stringify(listBody)).not.toContain("key_hash");
		expect(JSON.stringify(listBody)).not.toContain(created.data.key);

		const del = await fetchWorker(`/api/v1/api-keys/${created.data.id}`, {
			method: "DELETE",
			headers: auth,
		});
		expect(del.status).toBe(200);

		const listAfter = await fetchWorker("/api/v1/api-keys", {
			headers: auth,
		});
		const afterBody = (await listAfter.json()) as { data: unknown[] };
		expect(afterBody.data.length).toBe(0);
	});
});
