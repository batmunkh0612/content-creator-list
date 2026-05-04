"use client";

import { useState } from "react";
import { sessionsApi, type IgSessionInput } from "@/lib/api-endpoints";
import { ErrorRow } from "@/components/v2/error-row";
import type { IgSession } from "./use-sessions";

const inputStyle: React.CSSProperties = {
	width: "100%", height: 36,
	padding: "0 12px",
	background: "rgba(255,255,255,0.04)",
	border: "1px solid var(--line-2)",
	borderRadius: 8,
	color: "var(--tx-1)",
	fontSize: 13, outline: "none",
	fontFamily: "var(--mono)",
};

const textareaStyle: React.CSSProperties = {
	...inputStyle, height: "auto", minHeight: 70, padding: "8px 12px", resize: "vertical",
};

const labelStyle: React.CSSProperties = {
	fontSize: 10, color: "var(--tx-3)",
	letterSpacing: "0.1em", textTransform: "uppercase",
	fontFamily: "var(--mono)",
	marginBottom: 6, display: "block",
};

type Props = {
	session: IgSession;
	onCancel: () => void;
	onSaved: () => void;
};

// Inline editor — fields are blank by default to make it obvious that
// secrets aren't pre-filled. Empty submission keeps the existing value;
// non-empty replaces it.
export const SessionEditor = ({ session, onCancel, onSaved }: Props) => {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const [form, setForm] = useState<IgSessionInput>({ label: session.label || "" });

	const set = (k: keyof IgSessionInput) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			// Strip empties so the server treats them as "leave alone" rather
			// than "clear". The API accepts label/dsUserId blanks as null so
			// always send those.
			const payload: IgSessionInput = {
				label: form.label,
				dsUserId: form.dsUserId,
			};
			if (form.sessionid) payload.sessionid = form.sessionid;
			if (form.cookies)   payload.cookies   = form.cookies;
			if (form.wwwClaim)  payload.wwwClaim  = form.wwwClaim;
			await sessionsApi.update(session.id, payload);
			onSaved();
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
		}
	};

	return (
		<form onSubmit={submit} className="glass" style={{ padding: 18, marginBottom: 10, border: "1px solid rgba(139,92,246,0.4)" }}>
			<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", marginBottom: 12 }}>
				EDITING · <span style={{ color: "var(--tx-1)" }}>{session.label || session.id}</span>
				<span style={{ marginLeft: 8, color: "var(--tx-4)" }}>(blank fields keep existing values)</span>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
				<div>
					<label style={labelStyle}>LABEL</label>
					<input style={inputStyle} value={form.label || ""} onChange={(e) => set("label")(e.target.value)} />
				</div>
				<div>
					<label style={labelStyle}>DS_USER_ID</label>
					<input style={inputStyle} value={form.dsUserId || ""} onChange={(e) => set("dsUserId")(e.target.value)} placeholder={session.dsUserId || "123456789"} />
				</div>
			</div>

			<div style={{ marginTop: 12 }}>
				<label style={labelStyle}>SESSIONID · BLANK = KEEP</label>
				<input style={inputStyle} value={form.sessionid || ""} onChange={(e) => set("sessionid")(e.target.value)} placeholder="paste new sessionid to rotate" />
			</div>

			<div style={{ marginTop: 12 }}>
				<label style={labelStyle}>FULL COOKIE HEADER · BLANK = KEEP</label>
				<textarea style={textareaStyle} value={form.cookies || ""} onChange={(e) => set("cookies")(e.target.value)} placeholder="paste new full Cookie header to rotate" />
			</div>

			<div style={{ marginTop: 12 }}>
				<label style={labelStyle}>x-ig-www-claim · BLANK = KEEP</label>
				<input style={inputStyle} value={form.wwwClaim || ""} onChange={(e) => set("wwwClaim")(e.target.value)} />
			</div>

			{error ? <div style={{ marginTop: 12 }}><ErrorRow err={error} /></div> : null}

			<div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
				<button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>CANCEL</button>
				<button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
					{busy ? "SAVING…" : "SAVE CHANGES"}
				</button>
			</div>
		</form>
	);
};
