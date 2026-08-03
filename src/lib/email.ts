import type { AppConfig } from "@/lib/config";
import { isDevelopment } from "@/lib/config";

export type EmailDeps = {
	env: Env;
	config: AppConfig;
};

function logDev(kind: string, payload: Record<string, string>): void {
	console.info(`[email:${kind}] (dev)`, JSON.stringify(payload));
}

/**
 * Locally we log the verification/reset link instead of sending, so you can
 * develop without a deliverable domain. Set `EMAIL_DEV_DELIVERY=true` in
 * `.dev.vars` to actually send — that also needs `"remote": true` on the
 * `send_email` binding, otherwise workerd simulates the send and nothing goes out.
 */
function deliveryEnabled(deps: EmailDeps): boolean {
	if (!isDevelopment(deps.config)) return true;
	return deps.env.EMAIL_DEV_DELIVERY === "true";
}

async function sendEmail(
	deps: EmailDeps,
	args: { to: string; subject: string; html: string; text: string },
): Promise<void> {
	if (!deliveryEnabled(deps)) return;
	if (!deps.env.EMAIL) {
		console.warn("[email] Cloudflare EMAIL binding missing; skipping email");
		return;
	}
	try {
		await deps.env.EMAIL.send({
			// `from` takes a bare address or an `{ email, name }` object — an RFC 5322
			// `"Name <addr>"` string is rejected as an invalid address.
			from: { email: deps.config.fromEmail, name: deps.config.appName },
			to: args.to,
			subject: args.subject,
			html: args.html,
			text: args.text,
		});
	} catch (err) {
		// Surface the E_* code: `E_SENDER_NOT_VERIFIED` means the `FROM_EMAIL`
		// domain isn't onboarded (`wrangler email sending enable <domain>`), which
		// is otherwise indistinguishable from a transient failure.
		const code = (err as { code?: string })?.code ?? "UNKNOWN";
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[email] send failed (${code}): ${message}`);
		throw err;
	}
}

export async function sendVerificationEmail(
	deps: EmailDeps,
	args: { to: string; name: string; url: string },
): Promise<void> {
	if (isDevelopment(deps.config)) {
		logDev("verify", { to: args.to, url: args.url });
	}
	await sendEmail(deps, {
		to: args.to,
		subject: "Verify your email",
		html: `<p>Hi ${escapeHtml(args.name)},</p><p><a href="${args.url}">Verify your email</a></p>`,
		text: `Hi ${args.name},\n\nVerify your email: ${args.url}`,
	});
}

export async function sendPasswordResetEmail(
	deps: EmailDeps,
	args: { to: string; name: string; url: string },
): Promise<void> {
	if (isDevelopment(deps.config)) {
		logDev("reset", { to: args.to, url: args.url });
	}
	await sendEmail(deps, {
		to: args.to,
		subject: "Reset your password",
		html: `<p>Hi ${escapeHtml(args.name)},</p><p><a href="${args.url}">Reset password</a></p>`,
		text: `Hi ${args.name},\n\nReset your password: ${args.url}`,
	});
}

export async function sendOtpEmail(
	deps: EmailDeps,
	args: { to: string; otp: string; type: string },
): Promise<void> {
	if (isDevelopment(deps.config)) {
		logDev("otp", { to: args.to, type: args.type, otp: args.otp });
	}
	await sendEmail(deps, {
		to: args.to,
		subject: `Your code: ${args.otp}`,
		html: `<p>Your verification code is <strong>${escapeHtml(args.otp)}</strong>.</p>`,
		text: `Your verification code is ${args.otp}.`,
	});
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
