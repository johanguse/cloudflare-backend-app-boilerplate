import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { rateLimiter } from "@/lib/rate-limit";
import { chatBody } from "@/lib/schemas";
import type { HonoEnv } from "@/lib/types";
import { requireActiveUser } from "@/middlewares/active-user";
import { requireBearerAuth } from "@/middlewares/auth";

/**
 * Default Workers AI text model. Override per environment with the `AI_MODEL`
 * var in wrangler.jsonc — anything from the text-generation catalogue that
 * accepts a `messages` array works.
 */
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/** Caps on a single request, to bound both cost and the model's context. */
const MAX_OUTPUT_TOKENS = 1_024;

export const chatRoutes = new Hono<HonoEnv>();

chatRoutes.use("*", requireBearerAuth);
chatRoutes.use("*", requireActiveUser);
/** Per-user: Workers AI calls have a real cost, so this is tighter than the global API limit. */
chatRoutes.use(
	"*",
	rateLimiter({ limit: 20, windowSeconds: 300, keyPrefix: "chat" }),
);

/**
 * Streams a chat completion as Server-Sent Events.
 *
 * Workers AI already emits SSE frames (`data: {"response":"..."}`, terminated
 * by `data: [DONE]`), so the body is passed straight through rather than being
 * re-encoded — the client parses those frames directly.
 */
chatRoutes.post("/stream", async (c) => {
	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		throw new HTTPException(400, { message: "Invalid JSON body" });
	}
	const parsed = chatBody.safeParse(raw);
	if (!parsed.success) {
		throw parsed.error;
	}

	const model = (c.env.AI_MODEL?.trim() || DEFAULT_MODEL) as Parameters<
		Ai["run"]
	>[0];

	const stream = (await c.env.AI.run(model, {
		messages: parsed.data.messages,
		max_tokens: MAX_OUTPUT_TOKENS,
		stream: true,
	})) as unknown as ReadableStream;

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			// Streaming is pointless if a proxy buffers the whole body first.
			"X-Accel-Buffering": "no",
		},
	});
});
