import { api } from "./api";

const enc = encodeURIComponent;

const buildQs = (params: Record<string, unknown>): string => {
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v !== "" && v !== null && v !== undefined) qs.set(k, String(v));
	}
	const s = qs.toString();
	return s ? `?${s}` : "";
};

export type AuthCreds = { email: string; password: string; name?: string };

export const authApi = {
	register: (data: AuthCreds) => api.post("/auth/register", data),
	login:    (data: AuthCreds) => api.post("/auth/login", data),
	me:       () => api.get("/auth/me"),
	changePassword: (data: { currentPassword: string; newPassword: string }) =>
		api.post("/auth/change-password", data),
};

export const influencerApi = {
	get: (platform: string, username: string) =>
		api.get(`/influencer/${enc(platform)}/${enc(username)}`),
	list: (params: Record<string, unknown> = {}) =>
		api.get(`/influencers${buildQs(params)}`),
	followers: (platform: string, username: string, params: Record<string, unknown> = {}) =>
		api.get(`/influencer/${enc(platform)}/${enc(username)}/followers${buildQs(params)}`),
	following: (platform: string, username: string, params: Record<string, unknown> = {}) =>
		api.get(`/influencer/${enc(platform)}/${enc(username)}/following${buildQs(params)}`),
	recomputeMetrics: (platform: string, username: string, sampleSize?: number) =>
		api.post(
			`/influencer/${enc(platform)}/${enc(username)}/recompute-metrics`,
			sampleSize ? { sampleSize } : {},
		),
};

export const scrapeApi = {
	enqueue: (platform: string, username: string) =>
		api.post(`/scrape/${enc(platform)}/${enc(username)}`, {}),

	bulk: (data: { platform?: string; usernames?: string[]; items?: Array<{ platform: string; username: string }> }) =>
		api.post("/scrape/bulk", data),

	refreshAll: (data: { platform?: string; olderThanHours?: number; limit?: number } = {}) =>
		api.post("/scrape/refresh-all", data),

	fetchFollowers: (platform: string, username: string, max?: number) =>
		api.post(`/scrape/${enc(platform)}/${enc(username)}/followers`, max ? { max } : {}),

	refreshAllFollowers: (data: { olderThanHours?: number; onlyMissing?: boolean; limit?: number; max?: number } = {}) =>
		api.post("/scrape/followers/refresh-all", data),

	fetchFollowing: (platform: string, username: string, max?: number) =>
		api.post(`/scrape/${enc(platform)}/${enc(username)}/following`, max ? { max } : {}),

	refreshAllFollowing: (data: { olderThanHours?: number; onlyMissing?: boolean; limit?: number; max?: number } = {}) =>
		api.post("/scrape/following/refresh-all", data),

	fetchPosts: (platform: string, username: string, max?: number) =>
		api.post(`/scrape/${enc(platform)}/${enc(username)}/posts`, max ? { max } : {}),

	fetchReels: (platform: string, username: string, max?: number) =>
		api.post(`/scrape/${enc(platform)}/${enc(username)}/reels`, max ? { max } : {}),

	fetchStories: (platform: string, username: string) =>
		api.post(`/scrape/${enc(platform)}/${enc(username)}/stories`, {}),

	job: (id: string) => api.get(`/scrape/jobs/${enc(id)}`),
};

export const jobsApi = {
	list: (params: Record<string, unknown> = {}) =>
		api.get(`/scrape/jobs${buildQs(params)}`),
	retry: (id: string) => api.post(`/scrape/jobs/${enc(id)}/retry`, {}),
	retryAll: (data: { status?: string; kind?: string; platform?: string; username?: string; limit?: number } = {}) =>
		api.post("/scrape/jobs/retry-all", data),
};

export type IgSessionInput = {
	label?: string;
	sessionid?: string;
	dsUserId?: string;
	cookies?: string;
	wwwClaim?: string;
	enabled?: boolean;
	warmUp?: boolean;
};

export const sessionsApi = {
	list:    () => api.get("/sessions"),
	create:  (data: IgSessionInput) => api.post("/sessions", data),
	update:  (id: string, data: IgSessionInput) => api.patch(`/sessions/${enc(id)}`, data),
	remove:  (id: string) => api.delete(`/sessions/${enc(id)}`),
	reload:  () => api.post("/sessions/reload", {}),
};
