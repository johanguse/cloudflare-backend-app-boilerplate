import { and, desc, eq } from "drizzle-orm";
import type { Handler } from "hono";
import { Hono } from "hono";
import * as z from "zod";

import { analyses } from "@/db/schema/analyses";
import { fileUploads } from "@/db/schema/uploads";
import { createDb } from "@/lib/db";
import type { HonoEnv } from "@/lib/types";
import { requireActiveUser } from "@/middlewares/active-user";
import { requireBearerAuth } from "@/middlewares/auth";
import { getObject, getSignedUrl } from "@/lib/storage";

const FREE_TIER_LIMIT = 2;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PRIMARY_MODEL = "google/gemini-3.1-flash-lite";
const FALLBACK_MODEL = "x-ai/grok-4.3";

const PROMPTS: Record<string, string> = {
	color: `You are a professional colour analyst. Analyse this person's photo and return ONLY valid JSON — no markdown, no explanation.

Return this exact structure:
{
  "headline": "Season name, e.g. Soft Autumn",
  "season": "Two or three descriptors, e.g. Warm · Muted · Deep",
  "score": <integer 60-99>,
  "keywords": ["Descriptor1", "Descriptor2", "Descriptor3", "Descriptor4"],
  "colorSwatches": {
    "recommended": [
      {"id": "r1", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "r2", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "r3", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "r4", "hex": "#RRGGBB", "name": "Color name"}
    ],
    "neutral": [
      {"id": "n1", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "n2", "hex": "#RRGGBB", "name": "Color name"}
    ],
    "avoid": [
      {"id": "a1", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "a2", "hex": "#RRGGBB", "name": "Color name"}
    ]
  },
  "tips": [
    "Specific, actionable tip 1",
    "Specific, actionable tip 2",
    "Specific, actionable tip 3"
  ]
}`,

	style: `You are a professional personal stylist. Analyse this person's photo and return ONLY valid JSON — no markdown, no explanation.

Return this exact structure:
{
  "headline": "Style archetype name, e.g. Quiet Luxury",
  "season": "Two or three style descriptors, e.g. Minimalist · Refined · Classic",
  "score": <integer 60-99>,
  "keywords": ["Descriptor1", "Descriptor2", "Descriptor3", "Descriptor4"],
  "colorSwatches": {
    "recommended": [
      {"id": "r1", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "r2", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "r3", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "r4", "hex": "#RRGGBB", "name": "Color name"}
    ],
    "neutral": [
      {"id": "n1", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "n2", "hex": "#RRGGBB", "name": "Color name"}
    ],
    "avoid": [
      {"id": "a1", "hex": "#RRGGBB", "name": "Color name"},
      {"id": "a2", "hex": "#RRGGBB", "name": "Color name"}
    ]
  },
  "tips": [
    "Specific, actionable style tip 1",
    "Specific, actionable style tip 2",
    "Specific, actionable style tip 3"
  ]
}`,

	hair: `You are a professional hairstylist and colour expert. Analyse this person's photo and return ONLY valid JSON — no markdown, no explanation.

Return this exact structure:
{
  "headline": "Hair recommendation, e.g. Soft Layers",
  "season": "Hair descriptors, e.g. Volume · Movement · Flow",
  "score": <integer 60-99>,
  "keywords": ["Descriptor1", "Descriptor2", "Descriptor3", "Descriptor4"],
  "colorSwatches": {
    "recommended": [
      {"id": "r1", "hex": "#RRGGBB", "name": "Hair tone name"},
      {"id": "r2", "hex": "#RRGGBB", "name": "Hair tone name"},
      {"id": "r3", "hex": "#RRGGBB", "name": "Hair tone name"},
      {"id": "r4", "hex": "#RRGGBB", "name": "Hair tone name"}
    ],
    "neutral": [
      {"id": "n1", "hex": "#RRGGBB", "name": "Hair tone name"},
      {"id": "n2", "hex": "#RRGGBB", "name": "Hair tone name"}
    ],
    "avoid": [
      {"id": "a1", "hex": "#RRGGBB", "name": "Hair tone name"},
      {"id": "a2", "hex": "#RRGGBB", "name": "Hair tone name"}
    ]
  },
  "tips": [
    "Specific, actionable hair tip 1",
    "Specific, actionable hair tip 2",
    "Specific, actionable hair tip 3"
  ]
}`,

	age: `You are a skincare and wellness expert. Analyse this person's photo and return ONLY valid JSON — no markdown, no explanation.
Be encouraging and constructive. Focus on skin vitality, radiance, and actionable skincare advice.

Return this exact structure:
{
  "headline": "Positive skin summary, e.g. Radiant & Youthful",
  "season": "Skin quality descriptors, e.g. Glow · Hydration · Balance",
  "score": <integer 60-99>,
  "keywords": ["Descriptor1", "Descriptor2", "Descriptor3", "Descriptor4"],
  "colorSwatches": {
    "recommended": [
      {"id": "r1", "hex": "#RRGGBB", "name": "Flattering makeup/clothing tone"},
      {"id": "r2", "hex": "#RRGGBB", "name": "Flattering makeup/clothing tone"},
      {"id": "r3", "hex": "#RRGGBB", "name": "Flattering makeup/clothing tone"},
      {"id": "r4", "hex": "#RRGGBB", "name": "Flattering makeup/clothing tone"}
    ],
    "neutral": [
      {"id": "n1", "hex": "#RRGGBB", "name": "Neutral tone"},
      {"id": "n2", "hex": "#RRGGBB", "name": "Neutral tone"}
    ],
    "avoid": [
      {"id": "a1", "hex": "#RRGGBB", "name": "Tone to avoid"},
      {"id": "a2", "hex": "#RRGGBB", "name": "Tone to avoid"}
    ]
  },
  "tips": [
    "Specific, actionable skincare tip 1",
    "Specific, actionable skincare tip 2",
    "Specific, actionable skincare tip 3"
  ]
}`,

	outfit: `You are a brutally honest but kind professional fashion stylist. Analyse this outfit photo and return ONLY valid JSON — no markdown, no explanation.

Return this exact structure:
{
  "headline": "Outfit vibe summary, e.g. Chic and Polished",
  "season": "Style descriptors, e.g. Elevated Casual · Minimalist",
  "score": <integer 50-100>,
  "keywords": ["Descriptor1", "Descriptor2", "Descriptor3", "Descriptor4"],
  "colorSwatches": {
    "recommended": [
      {"id": "r1", "hex": "#RRGGBB", "name": "Complementary color"},
      {"id": "r2", "hex": "#RRGGBB", "name": "Complementary color"},
      {"id": "r3", "hex": "#RRGGBB", "name": "Complementary color"},
      {"id": "r4", "hex": "#RRGGBB", "name": "Complementary color"}
    ],
    "neutral": [
      {"id": "n1", "hex": "#RRGGBB", "name": "Neutral"},
      {"id": "n2", "hex": "#RRGGBB", "name": "Neutral"}
    ],
    "avoid": [
      {"id": "a1", "hex": "#RRGGBB", "name": "Avoid"},
      {"id": "a2", "hex": "#RRGGBB", "name": "Avoid"}
    ]
  },
  "tips": [
    "Actionable upgrade tip 1",
    "Actionable upgrade tip 2",
    "Actionable upgrade tip 3"
  ],
  "outfitSections": [
    {
      "title": "Overall Impression",
      "body": "2-3 sentence overall assessment",
      "strengths": "What works well",
      "improvements": "What could be improved"
    },
    {
      "title": "Color Harmony",
      "body": "Assessment of color choices",
      "strengths": "Color strengths",
      "improvements": "Color improvements"
    },
    {
      "title": "Silhouette & Proportions",
      "body": "Assessment of silhouette",
      "strengths": "Proportion strengths",
      "improvements": "Proportion improvements"
    },
    {
      "title": "Fit & Tailoring",
      "body": "Assessment of fit",
      "strengths": "Fit strengths",
      "improvements": "Fit improvements"
    },
    {
      "title": "Accessories & Details",
      "body": "Assessment of accessories",
      "strengths": "Accessory strengths",
      "improvements": "Accessory improvements"
    }
  ],
  "outfitBreakdown": [
    {"category": "Top", "description": "Brief assessment", "score": <1-10>},
    {"category": "Bottom", "description": "Brief assessment", "score": <1-10>},
    {"category": "Shoes", "description": "Brief assessment", "score": <1-10>},
    {"category": "Accessories", "description": "Brief assessment", "score": <1-10>},
    {"category": "Overall Styling", "description": "Brief assessment", "score": <1-10>}
  ],
  "outfitVerdict": "2-3 sentence final verdict paragraph"
}`,
};

const createAnalysisSchema = z.object({
	analysisType: z.enum(["color", "style", "hair", "age", "outfit"]),
	photoKey: z.string().min(1),
});

export const analysisRoutes = new Hono<HonoEnv>();

analysisRoutes.use("*", requireBearerAuth);
analysisRoutes.use("*", requireActiveUser);

async function callOpenRouter(
	env: Env,
	imageBase64: string,
	mimeType: string,
	prompt: string,
	model: string,
): Promise<string> {
	if (!env.OPENROUTER_KEY) {
		throw new Error("OPENROUTER_KEY is not configured");
	}

	const response = await fetch(OPENROUTER_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.OPENROUTER_KEY}`,
			"Content-Type": "application/json",
			"HTTP-Referer": "https://drape.app",
			"X-Title": "Drape Style App",
		},
		body: JSON.stringify({
			model,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image_url",
							image_url: {
								url: `data:${mimeType};base64,${imageBase64}`,
							},
						},
						{
							type: "text",
							text: prompt,
						},
					],
				},
			],
			temperature: 0.3,
			max_tokens: 2000,
			response_format: { type: "json_object" },
		}),
	});

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`OpenRouter ${response.status}: ${err}`);
	}

	const data = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
	};

	const content = data.choices?.[0]?.message?.content;
	if (!content) throw new Error("Empty response from model");
	return content;
}

// Convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

const createAnalysisHandler: Handler<HonoEnv> = async (c) => {
	const userId = c.get("userId") as string;
	const db = createDb(c.env.DB);

	// Parse body
	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		return c.json(
			{ error: { code: "VALIDATION_ERROR", message: "Expected JSON body" } },
			400,
		);
	}

	const parsed = createAnalysisSchema.safeParse(raw);
	if (!parsed.success) {
		return c.json(
			{ error: { code: "VALIDATION_ERROR", message: "Invalid payload" } },
			400,
		);
	}

	const { analysisType, photoKey } = parsed.data;

	// Note: In a real app with Stripe/RevenueCat integration, you would verify
	// the user's plan here. For this demo we'll use a simple count query.
	// We'll gate free tier to 2 analyses.
	const userAnalyses = await db
		.select()
		.from(analyses)
		.where(eq(analyses.userId, userId));

	// Let's assume everyone is free until proper paywall is connected
	if (userAnalyses.length >= FREE_TIER_LIMIT) {
		// return c.json(
		// 	{ error: { code: "PAYMENT_REQUIRED", message: "Upgrade to Drape Pro to unlock more analyses" } },
		// 	402,
		// );
		// Commenting out the strict limit so we don't break testing
	}

	// Fetch photo from R2 internally
	const [uploadRow] = await db
		.select()
		.from(fileUploads)
		.where(
			and(eq(fileUploads.storageKey, photoKey), eq(fileUploads.userId, userId)),
		)
		.limit(1);

	if (!uploadRow) {
		return c.json(
			{ error: { code: "NOT_FOUND", message: "Uploaded photo not found" } },
			404,
		);
	}

	const r2Obj = await getObject(c.env.STORAGE, photoKey);
	if (!r2Obj) {
		return c.json(
			{ error: { code: "NOT_FOUND", message: "Photo data missing in storage" } },
			404,
		);
	}

	const buffer = await r2Obj.arrayBuffer();
	const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
	const mimeType = uploadRow.mimeType;
	const prompt = PROMPTS[analysisType];

	// Call AI
	let resultJsonStr: string;
	let usedModel = PRIMARY_MODEL;

	try {
		resultJsonStr = await callOpenRouter(
			c.env,
			base64,
			mimeType,
			prompt,
			PRIMARY_MODEL,
		);
	} catch (err) {
		console.warn("Primary model failed, trying fallback:", err);
		try {
			resultJsonStr = await callOpenRouter(
				c.env,
				base64,
				mimeType,
				prompt,
				FALLBACK_MODEL,
			);
			usedModel = FALLBACK_MODEL;
		} catch (fallbackErr) {
			console.error("AI Analysis completely failed:", fallbackErr);
			return c.json(
				{ error: { code: "INTERNAL_ERROR", message: "Analysis failed" } },
				500,
			);
		}
	}

	// Clean JSON string
	const cleanedStr = resultJsonStr.replace(/```(?:json)?\n?/g, "").trim();

	// Store in DB
	const id = crypto.randomUUID();
	await db.insert(analyses).values({
		id,
		userId,
		analysisType,
		status: "done",
		photoKey,
		resultJson: cleanedStr,
		visionModel: usedModel,
		createdAt: new Date(),
	});

	// Parse it for the response so the client doesn't have to string-parse
	let resultParsed: unknown;
	try {
		resultParsed = JSON.parse(cleanedStr);
	} catch {
		resultParsed = { raw: cleanedStr }; // fallback if incredibly broken
	}

	return c.json({
		data: {
			id,
			analysisType,
			result: resultParsed,
			visionModel: usedModel,
		},
	});
};

const getHistoryHandler: Handler<HonoEnv> = async (c) => {
	const userId = c.get("userId") as string;
	const db = createDb(c.env.DB);

	const userAnalyses = await db
		.select()
		.from(analyses)
		.where(eq(analyses.userId, userId))
		.orderBy(desc(analyses.createdAt));

	const formatted = await Promise.all(
		userAnalyses.map(async (a) => {
			let resultParsed = null;
			if (a.resultJson) {
				try {
					resultParsed = JSON.parse(a.resultJson);
				} catch {
					// ignore parse errors
				}
			}

			const photoUrl = a.photoKey
				? await getSignedUrl(c.env, a.photoKey)
				: null;

			return {
				id: a.id,
				analysisType: a.analysisType,
				status: a.status,
				photoKey: a.photoKey,
				photoUrl,
				result: resultParsed,
				visionModel: a.visionModel,
				createdAt: a.createdAt,
			};
		}),
	);

	return c.json({
		data: formatted,
	});
};

analysisRoutes.post("/", createAnalysisHandler);
analysisRoutes.post("", createAnalysisHandler);
analysisRoutes.get("/history", getHistoryHandler);
