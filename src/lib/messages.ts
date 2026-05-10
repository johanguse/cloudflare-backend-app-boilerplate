/**
 * User-facing English message strings for all API responses.
 *
 * i18n pattern: keep all strings here, one key per message.
 * To add a new language, duplicate the `en` object, translate values,
 * then add a lookup in `getMessages(lang)` and call it with the
 * Accept-Language header from the request.
 */

const en = {
	auth: {
		// Sign in / sign up
		invalidCredentials: "Invalid email or password.",
		emailAlreadyExists: "An account with that email already exists.",
		emailNotVerified: "Please verify your email before signing in.",
		sessionExpired: "Your session has expired. Please sign in again.",
		unauthorized: "You must be signed in to do that.",
		missingAuthHeader: "Missing or invalid Authorization header.",

		// Password reset
		invalidResetToken: "This reset link is invalid or has expired.",
		resetEmailSent: "If that email exists, a reset link is on its way.",

		// Change password
		wrongPassword: "Current password is incorrect.",
		passwordTooShort: "Password must be at least 8 characters.",
		passwordChanged: "Password updated successfully.",

		// OAuth
		oauthNotConfigured: "This sign-in method is not configured.",
		oauthNoSession: "Sign-in did not return a session. Please try again.",
	},

	users: {
		notFound: "User not found.",
		updated: "Profile updated.",
		deleted: "Account deleted.",
		deviceRegistered: "Device registered for notifications.",
		deviceRemoved: "Device removed.",
		deviceNotFound: "Device token not registered.",
	},

	uploads: {
		tooLarge: "File is too large. Maximum is 12 MB.",
		missingFile: 'Expected a multipart field named "file".',
		invalidBase64: "Invalid base64 payload.",
		notFound: "Upload not found.",
		noPublicUrl: "Upload succeeded but no public URL is configured.",
	},

	generic: {
		badRequest: "Invalid request.",
		validationFailed: "The request data is invalid.",
		notFound: "Resource not found.",
		internalError: "Something went wrong. Please try again.",
		rateLimited: "Too many requests. Please slow down and try again.",
		invalidJson: "Request body must be valid JSON.",
	},
} as const;

export type Messages = typeof en;

/** Returns the message bundle for the given locale (falls back to EN). */
export function getMessages(_locale?: string | null): Messages {
	// Add locale branches here as you add translations, e.g.:
	// if (_locale?.startsWith("pt")) return pt;
	// if (_locale?.startsWith("es")) return es;
	return en;
}

/** Shorthand: always returns English messages. */
export const MSG = en;
