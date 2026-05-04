// Wrap any IG-CDN URL through our /api/avatar proxy so the browser can load
// it without 403'ing on missing Referer / cross-origin policy.

const IG_CDN_PATTERN = /(fbcdn\.net|cdninstagram\.com)/;

export const proxiedImage = (url: string | null | undefined): string | null => {
	if (!url || typeof url !== "string") return null;
	if (url.startsWith("/api/avatar")) return url;
	if (!IG_CDN_PATTERN.test(url)) return url;
	return `/api/avatar?u=${encodeURIComponent(url)}`;
};
