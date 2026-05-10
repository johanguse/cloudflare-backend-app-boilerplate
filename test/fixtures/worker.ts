/// <reference types="@cloudflare/vitest-pool-workers" />

import { SELF } from "cloudflare:test";

const origin = "http://localhost:8787";

/**
 * Build a request URL for in-pool `SELF.fetch` calls (host is arbitrary; routes match on path).
 */
export function testUrl(path: string): string {
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${origin}${normalized}`;
}

/**
 * Dispatches a request through the deployed worker under test (Vitest Workers pool).
 */
export function fetchWorker(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	return SELF.fetch(testUrl(path), init);
}
