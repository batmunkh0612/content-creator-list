"use client";

import { ErrorRow } from "@/components/v2/error-row";
import { useSessions } from "./use-sessions";
import { SessionForm } from "./session-form";
import { SessionRow } from "./session-row";

export const SessionsPage = () => {
	const { data, error, loading, refresh } = useSessions();
	const items = data?.items || [];

	const warm = items.filter((s) => s.enabled && !s.cold).length;
	const cold = items.filter((s) => s.enabled && s.cold).length;
	const off = items.filter((s) => !s.enabled).length;

	return (
		<>
			<div className="sec-head">
				<div className="sec-title">
					<span className="crumb">05 — sessions</span>
					<h2>Instagram session pool · {items.length}</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<span className="mono muted" style={{ fontSize: 11 }}>
						{warm} warm · {cold} cooldown · {off} disabled
					</span>
					<button className="btn btn-sm btn-ghost" onClick={refresh}>↻</button>
				</div>
			</div>

			<p className="mono muted" style={{ fontSize: 11, lineHeight: 1.55, marginTop: 0, marginBottom: 16 }}>
				Sessions in this pool are used by the followers / following workers. Add a new session
				here when an existing one starts hitting <strong style={{ color: "var(--tx-2)" }}>HTTP 401</strong> or{" "}
				<strong style={{ color: "var(--tx-2)" }}>cooldown</strong>; the worker reloads within ~30 seconds without a restart.
				Paste either a single <code style={{ color: "var(--tx-2)" }}>sessionid</code> (minimum) or the full{" "}
				<code style={{ color: "var(--tx-2)" }}>Cookie</code> header (preferred for paginated follower fetches).
			</p>

			<div style={{ marginBottom: 14 }}>
				<SessionForm onCreated={refresh} />
			</div>

			{error ? <ErrorRow err={error} /> : null}

			{loading && !items.length ? (
				<div className="glass" style={{ padding: 40, textAlign: "center", color: "var(--tx-3)" }}>Loading…</div>
			) : !items.length ? (
				<div className="glass" style={{ padding: 40, textAlign: "center", color: "var(--tx-3)" }}>
					No sessions yet. Add one above to enable follower / following fetches.
				</div>
			) : (
				items.map((s) => <SessionRow key={s.id} session={s} onChanged={refresh} />)
			)}
		</>
	);
};
