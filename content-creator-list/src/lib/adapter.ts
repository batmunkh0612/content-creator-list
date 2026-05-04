// Bridge between the backend's Influencer shape and the v2 design's
// expected shape. Synthesizes growth/series fields the backend doesn't
// store yet so charts render coherently — clearly marked "est." in UI.

import { proxiedImage } from "./image-proxy";

export type InfluencerInput = {
	id: string;
	platform: string;
	username: string;
	fullName?: string | null;
	bio?: string | null;
	isVerified?: boolean;
	profilePicUrl?: string | null;
	followers?: number;
	following?: number;
	postsCount?: number;
	followersFetched?: number;
	followingFetched?: number;
	avgLikes?: number;
	avgComments?: number;
	avgViews?: number;
	engagementRate?: number;
	postingFrequency?: number;
	lastScrapedAt?: string | null;
};

export type V2Influencer = ReturnType<typeof toV2> & {};

const COLOR_BY_PLATFORM: Record<string, string> = {
	instagram: "#ec4899",
	youtube:   "#ff5470",
	tiktok:    "#22d3ee",
	facebook:  "#3b82f6",
};

const initialsOf = (s: string | null | undefined) => (s || "").slice(0, 2).toUpperCase();

const seedRand = (s: string): number => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i += 1) h = (h ^ s.charCodeAt(i)) * 16777619;
	return ((h >>> 0) % 10_000) / 10_000;
};

const buildSpark = (seed: string, points = 14, base = 50): number[] => {
	const r = seedRand(seed);
	return Array.from({ length: points }, (_, i) =>
		base + Math.sin((i + r * 6) * 0.55) * 14 + i * (1.4 + r * 0.6) + r * 8
	);
};

const buildFollowerSeries = (current: number, seed: string, days = 90): number[] => {
	const r = seedRand(seed);
	const start = current * (0.72 + r * 0.18);
	return Array.from({ length: days }, (_, i) => {
		const t = i / (days - 1);
		const trend = start + (current - start) * t;
		const wobble = Math.sin(i * 0.4 + r * 5) * (current * 0.004);
		return Math.max(0, Math.round(trend + wobble));
	});
};

const buildEngagementBars = (rate: number, seed: string, days = 14): number[] => {
	const ratePct = (rate || 0) * 100;
	const r = seedRand(`${seed}eng`);
	return Array.from({ length: days }, (_, i) => {
		const wobble = Math.sin(i * 0.7 + r * 4) * (ratePct * 0.4);
		return Math.max(0, ratePct + wobble + (r - 0.5) * ratePct * 0.3);
	});
};

const buildDailyGain = (current: number, seed: string, days = 30): number[] => {
	const r = seedRand(`${seed}gain`);
	const baseDaily = current * 0.0008;
	return Array.from({ length: days }, (_, i) => {
		const sign = ((i + Math.floor(r * 7)) % 9 === 0) ? -1 : 1;
		const jitter = 0.4 + Math.abs(Math.sin(i + r * 3));
		return Math.round(sign * baseDaily * jitter);
	});
};

export const trendingScore = (inf: InfluencerInput): number => {
	const eng = (inf.engagementRate || 0) * 100;
	const lastScrapeBoost = inf.lastScrapedAt
		? Math.max(0, 1 - (Date.now() - new Date(inf.lastScrapedAt).getTime()) / (7 * 86_400_000))
		: 0.3;
	const followerWeight = Math.log10(Math.max(10, inf.followers || 0)) / 9;
	const score = eng * 4 + lastScrapeBoost * 25 + followerWeight * 35;
	return Math.max(10, Math.min(99, Math.round(score)));
};

export type V2Status = "viral" | "rising" | "dropping" | "stable";

export const statusOf = (score: number, eng?: number): V2Status => {
	if (score >= 88) return "viral";
	if (score >= 70 || (eng || 0) > 0.05) return "rising";
	if (score < 30) return "dropping";
	return "stable";
};

export const toV2 = (inf: InfluencerInput) => {
	const score = trendingScore(inf);
	const status = statusOf(score, inf.engagementRate);
	const seed = `${inf.platform}:${inf.username}`;
	const r = seedRand(seed);
	const growthDay = (r * 4 - 0.5) * (status === "dropping" ? -1 : 1);
	const growthWeek = growthDay * (3 + r * 2);
	const followersDelta = Math.round((inf.followers || 0) * (growthDay / 100));
	const category =
		inf.platform === "youtube"  ? "YouTube"  :
		inf.platform === "tiktok"   ? "TikTok"   :
		inf.platform === "facebook" ? "Facebook" : "Creator";

	return {
		id: inf.id,
		platform: inf.platform,
		username: inf.username,
		fullName: inf.fullName || "",
		bio: inf.bio || "",
		isVerified: !!inf.isVerified,
		profilePicUrl: proxiedImage(inf.profilePicUrl),
		initials: initialsOf(inf.username),
		color: COLOR_BY_PLATFORM[inf.platform] || "#8b5cf6",
		category,
		country: "🌐",
		followers: inf.followers || 0,
		following: inf.following || 0,
		postsCount: inf.postsCount || 0,
		followersFetched: inf.followersFetched || 0,
		followingFetched: inf.followingFetched || 0,
		avgLikes: Math.round(inf.avgLikes || 0),
		avgComments: Math.round(inf.avgComments || 0),
		avgViews: Math.round(inf.avgViews || 0),
		engagementRate: (inf.engagementRate || 0) * 100,
		postFrequency: inf.postingFrequency || 0,
		lastScrapedAt: inf.lastScrapedAt,
		trendingScore: score,
		status,
		growthDay,
		growthWeek,
		followersDelta,
		spark: buildSpark(seed, 14, Math.max(40, score / 1.4)),
		followerSeries: buildFollowerSeries(inf.followers || 0, seed),
		engagementBars: buildEngagementBars(inf.engagementRate || 0, seed),
		dailyGain: buildDailyGain(inf.followers || 0, seed),
	};
};
