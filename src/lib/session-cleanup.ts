import { lt } from "drizzle-orm";

import { session, verification } from "@/db/schema/auth";
import { createDb } from "@/lib/db";

/**
 * Removes expired Better Auth sessions and verification rows from D1.
 * KV session entries expire via TTL; this cleans authoritative DB rows.
 */
export async function cleanupExpiredAuthRows(
	env: Env,
): Promise<{ sessionsDeleted: number; verificationsDeleted: number }> {
	const db = createDb(env.DB);
	const now = new Date();

	const sessionRows = await db
		.delete(session)
		.where(lt(session.expiresAt, now))
		.returning({ id: session.id });

	const verificationRows = await db
		.delete(verification)
		.where(lt(verification.expiresAt, now))
		.returning({ id: verification.id });

	return {
		sessionsDeleted: sessionRows.length,
		verificationsDeleted: verificationRows.length,
	};
}
