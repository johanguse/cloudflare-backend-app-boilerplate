import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Better Auth–compatible core tables (`user`, `session`, `account`, `verification`).
 * Add columns here when enabling Better Auth plugins (2FA, passkeys, etc.).
 */
export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
	/** Avatar. Either an R2 storage key (uploaded) or an absolute URL (OAuth). */
	image: text("image"),
	/**
	 * Optional profile fields. Declared as Better Auth `additionalFields` in
	 * `lib/auth.ts` so `auth.api.updateUser` writes them and the cached session
	 * stays in sync — don't write these with a bare Drizzle update.
	 */
	bio: text("bio"),
	company: text("company"),
	jobTitle: text("job_title"),
	phone: text("phone"),
	website: text("website"),
	country: text("country"),
	timezone: text("timezone"),
	onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
		.notNull()
		.default(false),
	onboardingStep: integer("onboarding_step").notNull().default(0),
	/** Set when the user schedules account deletion (soft delete). */
	deletedAt: integer("deleted_at", { mode: "timestamp" }),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(t) => [index("idx_session_user_id").on(t.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(t) => [
		index("idx_account_user_id").on(t.userId),
		index("idx_account_provider_account").on(t.providerId, t.accountId),
	],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }),
		updatedAt: integer("updated_at", { mode: "timestamp" }),
	},
	(t) => [
		index("idx_verification_identifier").on(t.identifier),
		index("idx_verification_expires_at").on(t.expiresAt),
	],
);
