import { Resend } from "resend";

import type { AppConfig } from "@/lib/config";
import { isDevelopment } from "@/lib/config";

export type EmailDeps = {
	env: Env;
	config: AppConfig;
};

function getResend(deps: EmailDeps): Resend | null {
	const key = deps.config.resendApiKey ?? deps.env.RESEND_API_KEY;
	if (!key) {
		return null;
	}
	return new Resend(key);
}

function logDev(kind: string, payload: Record<string, string>): void {
	console.info(`[email:${kind}] (dev)`, JSON.stringify(payload));
}

export async function sendVerificationEmail(
	deps: EmailDeps,
	args: { to: string; name: string; url: string },
): Promise<void> {
	if (isDevelopment(deps.config)) {
		logDev("verify", { to: args.to, url: args.url });
		return;
	}
	const resend = getResend(deps);
	if (!resend) {
		console.warn("[email] RESEND_API_KEY missing; skipping verification email");
		return;
	}
	await resend.emails.send({
		from: `${deps.config.appName} <${deps.config.resendFromEmail}>`,
		to: args.to,
		subject: "Verify your email",
		html: `<p>Hi ${escapeHtml(args.name)},</p><p><a href="${args.url}">Verify your email</a></p>`,
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
	const resend = getResend(deps);
	if (!resend) {
		console.warn(
			"[email] RESEND_API_KEY missing; skipping password reset email",
		);
		return;
	}
	await resend.emails.send({
		from: `${deps.config.appName} <${deps.config.resendFromEmail}>`,
		to: args.to,
		subject: "Reset your password",
		html: `<p>Hi ${escapeHtml(args.name)},</p><p><a href="${args.url}">Reset password</a></p>`,
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
	const resend = getResend(deps);
	if (!resend) {
		console.warn("[email] RESEND_API_KEY missing; skipping OTP email");
		return;
	}
	await resend.emails.send({
		from: `${deps.config.appName} <${deps.config.resendFromEmail}>`,
		to: args.to,
		subject: `Your code: ${args.otp}`,
		html: `<p>Your verification code is <strong>${escapeHtml(args.otp)}</strong>.</p>`,
	});
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
