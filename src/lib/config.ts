import * as z from "zod";

const configSchema = z.object({
	environment: z.string().min(1),
	appName: z.string().min(1),
	baseUrl: z.string().url(),
	trustedOrigins: z.array(z.string().min(1)),
	fromEmail: z.string().email().or(z.string().min(1)),
	authSecret: z.string(),
	googleClientId: z.string().optional(),
	googleClientSecret: z.string().optional(),
	appleClientId: z.string().optional(),
	appleClientSecret: z.string().optional(),
	/** If set, `GET /api/v1/uploads/:key/url` returns this base joined with the object key (public buckets / CDN). */
	r2PublicBaseUrl: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

export function getConfig(env: Env): AppConfig {
	const trustedOrigins = env.TRUSTED_ORIGINS.split(",")
		.map((o) => o.trim())
		.filter(Boolean);
	const parsed = configSchema.safeParse({
		environment: env.ENVIRONMENT,
		appName: env.APP_NAME,
		baseUrl: env.BETTER_AUTH_URL,
		trustedOrigins,
		fromEmail: env.FROM_EMAIL,
		authSecret: env.BETTER_AUTH_SECRET ?? "",
		googleClientId: env.GOOGLE_CLIENT_ID || undefined,
		googleClientSecret: env.GOOGLE_CLIENT_SECRET || undefined,
		appleClientId: env.APPLE_CLIENT_ID || undefined,
		appleClientSecret: env.APPLE_CLIENT_SECRET || undefined,
		r2PublicBaseUrl: env.R2_PUBLIC_BASE_URL?.trim()
			? env.R2_PUBLIC_BASE_URL.trim()
			: undefined,
	});
	if (!parsed.success) {
		// Include the field — a bare "Invalid input" gives no clue which var in
		// wrangler.jsonc / .dev.vars is missing or malformed.
		const msg = parsed.error.issues
			.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
			.join("; ");
		throw new Error(`Invalid configuration: ${msg}`);
	}
	const c = parsed.data;
	let authSecret = c.authSecret;
	if (
		(c.environment === "local" || c.environment === "development") &&
		authSecret.length < 32
	) {
		authSecret = "local-dev-better-auth-secret-do-not-use-in-prod!!";
	}
	if (
		(c.environment === "staging" || c.environment === "production") &&
		authSecret.length < 32
	) {
		throw new Error(
			"BETTER_AUTH_SECRET must be at least 32 characters in staging/production",
		);
	}
	return { ...c, authSecret };
}

export function isDevelopment(config: AppConfig): boolean {
	return config.environment === "local" || config.environment === "development";
}
