// Parse anything the user pastes — bare username, "@handle", or full
// profile URL across the four platforms — into { platform, username }.

export type ParsedHandle =
	| { platform: string; username: string; error?: undefined }
	| { error: string; platform?: undefined; username?: undefined }
	| null;

const HOST_TO_PLATFORM: Array<{ test: RegExp; platform: string }> = [
	{ test: /(^|\.)instagram\.com$/i, platform: "instagram" },
	{ test: /(^|\.)tiktok\.com$/i,    platform: "tiktok" },
	{ test: /(^|\.)youtube\.com$/i,   platform: "youtube" },
	{ test: /(^|\.)youtu\.be$/i,      platform: "youtube" },
	{ test: /(^|\.)facebook\.com$/i,  platform: "facebook" },
	{ test: /(^|\.)fb\.com$/i,        platform: "facebook" },
];

const NON_PROFILE_SEGMENTS = new Set([
	"p", "reel", "reels", "stories", "tv",
	"video", "photo", "watch", "shorts",
	"explore", "accounts",
]);

const looksLikeUsername = (s: string) => /^[A-Za-z0-9._-]{1,80}$/.test(s);
const stripAt = (s: string) => s.replace(/^@+/, "");

const extractYoutube = (segs: string[]): { username?: string; error?: string } => {
	if (segs[0] === "c" || segs[0] === "channel" || segs[0] === "user") {
		if (!segs[1]) return { error: `YouTube ${segs[0]} URL is missing the name.` };
		return { username: segs[1] };
	}
	return { username: stripAt(segs[0]) };
};

export const parseHandle = (input: string, defaultPlatform = "instagram"): ParsedHandle => {
	if (!input || typeof input !== "string") return null;
	const raw = input.trim();
	if (!raw) return null;

	if (!/^https?:\/\//i.test(raw) && !raw.includes("/")) {
		const u = stripAt(raw);
		if (!looksLikeUsername(u)) return { error: `"${u}" doesn't look like a valid username.` };
		return { platform: defaultPlatform, username: u };
	}

	const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	let url: URL;
	try { url = new URL(withScheme); }
	catch { return { error: `Couldn't parse "${raw}" as a URL.` }; }

	const match = HOST_TO_PLATFORM.find((p) => p.test.test(url.hostname));
	if (!match) return { error: `Unsupported host "${url.hostname}".` };
	const platform = match.platform;

	const segs = url.pathname.split("/").filter(Boolean);
	if (!segs.length) return { error: "URL has no path — paste a profile URL." };

	const first = segs[0].toLowerCase();
	if (NON_PROFILE_SEGMENTS.has(first)) {
		return { error: `That's a ${first} URL, not a profile. Paste the creator's profile URL.` };
	}

	let username: string | undefined;
	if (platform === "tiktok") {
		if (!segs[0].startsWith("@")) {
			return { error: 'TikTok profile URLs start with "@" — try https://tiktok.com/@username' };
		}
		username = stripAt(segs[0]);
	} else if (platform === "youtube") {
		const yt = extractYoutube(segs);
		if (yt.error) return { error: yt.error };
		username = yt.username;
	} else {
		username = stripAt(segs[0]);
	}

	if (!username) return { error: `Couldn't pull a username out of "${raw}".` };
	if (!looksLikeUsername(username)) {
		return { error: `"${username}" doesn't look like a valid ${platform} username.` };
	}
	return { platform, username };
};
