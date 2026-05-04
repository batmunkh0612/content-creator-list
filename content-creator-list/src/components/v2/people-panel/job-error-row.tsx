type Kind = "rate-limit" | "auth" | "blocked" | "generic";

const PALETTE: Record<Kind, { bg: string; border: string; fg: string }> = {
	"rate-limit": { bg: "rgba(255,181,71,0.12)", border: "rgba(255,181,71,0.35)", fg: "#ffd49a" },
	auth:         { bg: "rgba(255,84,112,0.12)", border: "rgba(255,84,112,0.35)", fg: "#ff9bb5" },
	blocked:      { bg: "rgba(255,84,112,0.12)", border: "rgba(255,84,112,0.35)", fg: "#ff9bb5" },
	generic:      { bg: "rgba(255,84,112,0.10)", border: "rgba(255,84,112,0.30)", fg: "#ff8aa0" },
};

const classify = (m: string): { kind: Kind; title: string; hint: string } => {
	if (/HTTP 429|Wait a few minutes|too many requests/i.test(m)) {
		return {
			kind: "rate-limit",
			title: "Instagram rate-limited the session",
			hint: "IG temporarily blocked our session. This usually clears in 15–30 minutes. Try again then, or paste a fresh sessionid into IG_COOKIES.",
		};
	}
	if (/login_required|HTTP 401|HTTP 403/i.test(m)) {
		return {
			kind: "auth",
			title: "Session is no longer authenticated",
			hint: 'IG invalidated the session cookie. Open instagram.com → DevTools → Cookies → copy a fresh "sessionid" into IG_COOKIES, then restart the worker.',
		};
	}
	if (/login wall|EXTRACTION_FAILED|API_BLOCKED/i.test(m)) {
		return {
			kind: "blocked",
			title: "Instagram blocked anonymous access",
			hint: "For this profile IG required login. Make sure IG_COOKIES is set with a logged-in session.",
		};
	}
	return { kind: "generic", title: "Fetch failed", hint: m };
};

export const JobErrorRow = ({ message }: { message: string }) => {
	const { kind, title, hint } = classify(String(message));
	const palette = PALETTE[kind];
	return (
		<div style={{
			marginTop: 12, padding: "10px 14px",
			background: palette.bg,
			border: `1px solid ${palette.border}`,
			borderRadius: 10,
			color: palette.fg,
			fontSize: 12,
		}}>
			<div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
			<div style={{ opacity: 0.9 }}>{hint}</div>
		</div>
	);
};
