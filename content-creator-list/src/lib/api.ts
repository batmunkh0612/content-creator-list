// Tiny fetch wrapper. Reads the JWT from localStorage on every call so a
// fresh login or logout takes effect without a page reload. The /api prefix
// is forwarded by next.config rewrites to the backend in dev and prod.

const BASE = "/api";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type RequestOpts = {
	method?: Method;
	body?: unknown;
	signal?: AbortSignal;
};

export class ApiError extends Error {
	status: number;
	details?: unknown;
	constructor(status: number, message: string, details?: unknown) {
		super(message);
		this.status = status;
		this.details = details;
	}
}

const readToken = (): string | null => {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem("token");
};

const request = async <T = unknown>(path: string, opts: RequestOpts = {}): Promise<T | null> => {
	const { method = "GET", body, signal } = opts;
	const token = readToken();
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;

	const res = await fetch(`${BASE}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		signal,
	});

	if (res.status === 204) return null;

	let payload: unknown = null;
	try { payload = await res.json(); } catch { /* non-JSON */ }

	if (!res.ok) {
		const p = payload as { error?: { message?: string; details?: unknown } } | null;
		const msg = p?.error?.message || res.statusText || "Request failed";
		throw new ApiError(res.status, msg, p?.error?.details);
	}
	return payload as T;
};

export const api = {
	get:    <T = unknown>(path: string, opts?: RequestOpts) => request<T>(path, { ...opts, method: "GET" }),
	post:   <T = unknown>(path: string, body?: unknown, opts?: RequestOpts) =>
		request<T>(path, { ...opts, method: "POST", body }),
	patch:  <T = unknown>(path: string, body?: unknown, opts?: RequestOpts) =>
		request<T>(path, { ...opts, method: "PATCH", body }),
	delete: <T = unknown>(path: string, opts?: RequestOpts) =>
		request<T>(path, { ...opts, method: "DELETE" }),
};
