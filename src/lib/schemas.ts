import * as z from "zod";

import { MSG } from "@/lib/messages";

/**
 * Request-body schemas shared between route handlers and `scripts/generate-openapi.ts`.
 * Kept dependency-free (zod + messages only) so the OpenAPI generator can
 * import them without pulling in Cloudflare bindings or Better Auth.
 */

export const registerBody = z.object({
	email: z.string().email(),
	password: z.string().min(1),
	name: z.string().min(1),
});

export const loginBody = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export const refreshBody = z.object({
	refreshToken: z.string().min(1),
});

export const verifyEmailBody = z.object({
	token: z.string().min(1),
});

export const forgotPasswordBody = z.object({
	email: z.string().email(),
});

export const resetPasswordBody = z.object({
	token: z.string().min(1),
	newPassword: z.string().min(1),
});

export const appleBody = z.object({
	identityToken: z.string().min(1),
	authorizationCode: z.string().optional(),
	fullName: z
		.object({
			givenName: z.string().optional(),
			familyName: z.string().optional(),
		})
		.optional(),
});

export const googleNativeBody = z.object({
	idToken: z.string().min(1),
	nonce: z.string().optional(),
	accessToken: z.string().optional(),
});

export const authChangePasswordBody = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8, MSG.auth.passwordTooShort),
});

/** Free-text profile field: trimmed, capped, and `""` normalised to `null`. */
const profileText = (max: number) =>
	z
		.string()
		.max(max)
		.transform((v) => {
			const trimmed = v.trim();
			return trimmed.length > 0 ? trimmed : null;
		})
		.nullable()
		.optional();

export const patchMeBody = z
	.object({
		name: z.string().min(1).max(120).optional(),
		avatar: z.string().nullable().optional(),
		bio: profileText(500),
		company: profileText(120),
		jobTitle: profileText(120),
		phone: profileText(40),
		website: profileText(200),
		country: profileText(80),
		timezone: profileText(64),
		onboardingCompleted: z.boolean().optional(),
		onboardingStep: z.number().int().min(0).max(100).optional(),
	})
	.refine((b) => Object.values(b).some((v) => v !== undefined), {
		message: "At least one field is required",
	});

export const userChangePasswordBody = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8),
});

export const deviceRegisterBody = z.object({
	token: z.string().min(1),
	platform: z.enum(["ios", "android"]),
});

export const createKeyBody = z.object({
	name: z.string().min(1).max(128),
});

export const jsonUploadBody = z.object({
	fileBase64: z.string().min(1),
	mimeType: z.string().min(1),
	filename: z.string().optional(),
});

export const createAnalysisBody = z.object({
	analysisType: z.enum(["color", "style", "hair", "age", "outfit"]),
	photoKey: z.string().min(1),
});

export const chatBody = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant", "system"]),
				content: z.string().min(1).max(8_000),
			}),
		)
		.min(1)
		.max(40),
});
