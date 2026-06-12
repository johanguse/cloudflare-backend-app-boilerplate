import type { AppConfig } from "@/lib/config";
import { isDevelopment } from "@/lib/config";

export type EmailDeps = {
	env: Env;
	config: AppConfig;
};

function logDev(kind: string, payload: Record<string, string>): void {
	console.info(`[email:${kind}] (dev)`, JSON.stringify(payload));
}

async function sendEmail(
	deps: EmailDeps,
	args: { to: string; subject: string; html: string; text: string },
): Promise<void> {
	if (!deps.env.EMAIL) {
		console.warn("[email] Cloudflare EMAIL binding missing; skipping email");
		return;
	}
	await deps.env.EMAIL.send({
		from: `${deps.config.appName} <${deps.config.fromEmail}>`,
		to: args.to,
		subject: args.subject,
		html: args.html,
		text: args.text,
	});
}

export async function sendVerificationEmail(
	deps: EmailDeps,
	args: { to: string; name: string; url: string },
): Promise<void> {
	if (isDevelopment(deps.config)) {
		logDev("verify", { to: args.to, url: args.url });
		return;
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
		return;
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
		return;
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
