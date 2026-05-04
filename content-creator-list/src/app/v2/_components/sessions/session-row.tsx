"use client";

import { useState } from "react";
import { sessionsApi } from "@/lib/api-endpoints";
import { fmtRel } from "@/lib/format";
import type { IgSession } from "./use-sessions";
import { SessionEditor } from "./session-editor";

type Props = { session: IgSession; onChanged: () => void };

const stateLabel = (s: IgSession): { label: string; cls: string } => {
	if (!s.enabled)              return { label: "DISABLED", cls: "stable" };
	if (s.cold)                  return { label: "COOLDOWN", cls: "dropping" };
	if (s.inPool && s.hasFullJar) return { label: "WARM · FULL JAR", cls: "rising" };
	if (s.inPool)                return { label: "WARM", cls: "rising" };
	return { label: "PENDING POOL", cls: "neon" };
};

export const SessionRow = ({ session, onChanged }: Props) => {
	const [editing, setEditing] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const state = stateLabel(session);
	const cooldownLeft =
		session.cold && session.cooldownEndsAt
			? Math.max(0, Math.ceil((new Date(session.cooldownEndsAt).getTime() - Date.now()) / 60_000))
			: null;

	const wrap = (fn: () => Promise<unknown>) => async () => {
		setError(null);
		setBusy(true);
		try { await fn(); onChanged(); }
		catch (err) { setError(err instanceof Error ? err.message : String(err)); }
		finally { setBusy(false); }
	};

	const onToggle  = wrap(() => sessionsApi.update(session.id, { enabled: !session.enabled }));
	const onWarmUp  = wrap(() => sessionsApi.update(session.id, { warmUp: true }));
	const onDelete  = wrap(async () => {
		if (!window.confirm(`Delete session ${session.label || session.id}?`)) return;
		await sessionsApi.remove(session.id);
	});

	if (editing) {
		return (
			<SessionEditor
				session={session}
				onCancel={() => setEditing(false)}
				onSaved={() => { setEditing(false); onChanged(); }}
			/>
		);
	}

	return (
		<div className="glass" style={{ padding: 16, marginBottom: 10 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
				<span className={`badge ${state.cls}`}>{state.label}</span>
				<div style={{ flex: 1, minWidth: 200 }}>
					<div style={{ fontSize: 14, fontWeight: 500 }}>
						{session.label || <span style={{ color: "var(--tx-3)" }}>(unnamed)</span>}
						<span className="mono" style={{ marginLeft: 8, fontSize: 11, color: "var(--tx-4)" }}>{session.id}</span>
					</div>
					<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
						<span>sessionid: {session.sessionid || "—"}</span>
						<span>cookies: {session.cookies || "—"}</span>
						{session.dsUserId && <span>ds_user_id: {session.dsUserId}</span>}
						{session.lastUsedAt && <span>used {fmtRel(session.lastUsedAt)}</span>}
						{cooldownLeft != null && <span style={{ color: "#ffd49a" }}>cool {cooldownLeft}m</span>}
					</div>
				</div>
				<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
					{session.cold && (
						<button className="btn btn-sm btn-ghost" onClick={onWarmUp} disabled={busy} title="Clear the cooldown after rotating cookies">
							♨ WARM UP
						</button>
					)}
					<button className="btn btn-sm btn-ghost" onClick={onToggle} disabled={busy}>
						{session.enabled ? "DISABLE" : "ENABLE"}
					</button>
					<button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)} disabled={busy}>
						EDIT
					</button>
					<button className="btn btn-sm btn-ghost" onClick={onDelete} disabled={busy} title="Delete this session">
						DELETE
					</button>
				</div>
			</div>
			{error && (
				<div className="mono" style={{ marginTop: 10, fontSize: 11, color: "#ff8aa0" }}>{error}</div>
			)}
		</div>
	);
};
