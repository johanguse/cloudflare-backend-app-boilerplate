import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, emailOTP, jwt } from "better-auth/plugins";

import * as authSchema from "@/db/schema/auth";
import { jwks } from "@/db/schema/jwks";
import { getConfig, isDevelopment } from "@/lib/config";
import type { Database } from "@/lib/db";
import * as email from "@/lib/email";

/**
 * Better Auth for mobile: Bearer header + JWT access tokens (15m) + refresh session (30d in KV + D1).
 */
export function createAuth(env: Env, db: Database) {
	const config = getConfig(env);
	const emailDeps = { env, config };

	const social: {
		google?: { clientId: string; clientSecret: string };
		apple?: { clientId: string; clientSecret: string };
	} = {};
	if (config.googleClientId && config.googleClientSecret) {
		social.google = {
			clientId: config.googleClientId,
			clientSecret: config.googleClientSecret,
		};
	}
	if (config.appleClientId && config.appleClientSecret) {
		social.apple = {
			clientId: config.appleClientId,
			clientSecret: config.appleClientSecret,
		};
	}

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: {
				...authSchema,
				jwks,
			},
		}),
		secret: config.authSecret,
		baseURL: config.baseUrl,
		basePath: "/api/auth",
		trustedOrigins: config.trustedOrigins,
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			requireEmailVerification: !isDevelopment(config),
			sendResetPassword: async ({ user, url }) => {
				await email.sendPasswordResetEmail(emailDeps, {
					to: user.email,
					name: user.name,
					url,
				});
			},
		},
		emailVerification: {
			sendVerificationEmail: async ({ user, url }) => {
				await email.sendVerificationEmail(emailDeps, {
					to: user.email,
					name: user.name,
					url,
				});
			},
		},
		...(Object.keys(social).length > 0 ? { socialProviders: social } : {}),
		secondaryStorage: {
			get: async (key) => env.SESSION_KV.get(key),
			set: async (key, value, ttl) => {
				if (ttl) {
					await env.SESSION_KV.put(key, value, { expirationTtl: ttl });
				} else {
					await env.SESSION_KV.put(key, value);
				}
			},
			delete: async (key) => {
				await env.SESSION_KV.delete(key);
			},
		},
		session: {
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24,
			storeSessionInDatabase: true,
		},
		rateLimit: {
			storage: "secondary-storage",
			window: 60,
			max: 30,
		},
		plugins: [
			bearer(),
			jwt({
				jwt: {
					issuer: config.baseUrl,
					expirationTime: "15m",
				},
			}),
			emailOTP({
				expiresIn: 600,
				sendVerificationOTP: async ({ email: to, otp, type: _type }) => {
					await email.sendOtpEmail(emailDeps, { to, otp, type: _type });
				},
			}),
		],
	});
}

export type AuthInstance = ReturnType<typeof createAuth>;
