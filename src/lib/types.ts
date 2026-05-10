import type { AuthInstance } from "@/lib/auth";

type AuthSessionBundle = AuthInstance["$Infer"]["Session"];

export type AuthUser = AuthSessionBundle["user"];
export type AuthSession = AuthSessionBundle["session"];

/** Hono app env: Cloudflare bindings on `c.env`. */
export type HonoEnv = {
	Bindings: Env;
	Variables: {
		/** Set by `requireBearerAuth` or `requireApiKeyAuth`. */
		user?: AuthUser;
		/** Present for Bearer auth; omitted for API key auth. */
		session?: AuthSession;
		userId?: string;
		authMethod?: "bearer" | "api_key";
	};
};

export type ApiSuccess<T> = { data: T };

export type ApiResponse<T> = ApiSuccess<T>;

export type PaginatedMeta = {
	total: number;
	page: number;
	limit: number;
	hasMore: boolean;
};

export type ApiPaginated<T> = {
	data: T[];
	meta: PaginatedMeta;
};

export type PaginatedResponse<T> = ApiPaginated<T>;

export type ApiErrorBody = {
	error: {
		code: string;
		message: string;
		details?: Record<string, string | number | boolean>;
	};
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
	return (
		typeof value === "object" &&
		value !== null &&
		"error" in value &&
		typeof (value as ApiErrorBody).error === "object" &&
		(value as ApiErrorBody).error !== null &&
		typeof (value as ApiErrorBody).error.code === "string"
	);
}
