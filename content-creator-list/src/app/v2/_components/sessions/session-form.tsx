"use client";

import { useState } from "react";
import { sessionsApi, type IgSessionInput } from "@/lib/api-endpoints";
import { ErrorRow } from "@/components/v2/error-row";

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
	...inputStyle,
	height: "auto",
	minHeight: 70,
	padding: "8px 12px",
	resize: "vertical",
};

const labelStyle: React.CSSProperties = {
	fontSize: 10, color: "var(--tx-3)",
	letterSpacing: "0.1em", textTransform: "uppercase",
	fontFamily: "var(--mono)",
	marginBottom: 6,
	display: "block",
};

type Props = { onCreated: () => void };

// Add-new-session form. Either `sessionid` (minimum) or `cookies` (full jar)
// is required — the backend re-validates and returns 400 otherwise.
export const SessionForm = ({ onCreated }: Props) => {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const [form, setForm] = useState<IgSessionInput>({});

	const set = (k: keyof IgSessionInput) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setBusy(true);
		try {
			await sessionsApi.create(form);
			setForm({});
			setOpen(false);
			onCreated();
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
		}
	};

	if (!open) {
		return (
			<button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
				+ ADD SESSION
			</button>
		);
	}

	return (
		<form onSubmit={submit} className="glass" style={{ padding: 18, marginBottom: 16 }}>
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
				<div>
					<label style={labelStyle}>LABEL · OPTIONAL</label>
					<input style={inputStyle} value={form.label || ""} onChange={(e) => set("label")(e.target.value)} placeholder="throwaway-acct-1" />
				</div>
				<div>
					<label style={labelStyle}>DS_USER_ID · OPTIONAL</label>
					<input style={inputStyle} value={form.dsUserId || ""} onChange={(e) => set("dsUserId")(e.target.value)} placeholder="123456789" />
				</div>
			</div>

			<div style={{ marginTop: 12 }}>
				<label style={labelStyle}>SESSIONID · MINIMUM (followers / following only)</label>
				<input style={inputStyle} value={form.sessionid || ""} onChange={(e) => set("sessionid")(e.target.value)} placeholder="<sessionid value from instagram.com cookies>" />
			</div>

			<div style={{ marginTop: 12 }}>
				<label style={labelStyle}>FULL COOKIE HEADER · REQUIRED FOR POSTS FETCH</label>
				<textarea style={textareaStyle} value={form.cookies || ""} onChange={(e) => set("cookies")(e.target.value)} placeholder='Paste the full Cookie request header from any /api/v1/* request. Must include csrftoken — the GraphQL posts endpoint rejects requests without it.' />
				<p className="mono muted" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.55 }}>
					DevTools → Network → click any request → Headers → Request Headers → right-click <strong style={{ color: "var(--tx-2)" }}>Cookie</strong> → Copy value.
					Includes <code style={{ color: "var(--tx-2)" }}>csrftoken, mid, datr, rur, sessionid, ds_user_id, ig_did</code>, etc.
				</p>
			</div>

			<div style={{ marginTop: 12 }}>
				<label style={labelStyle}>x-ig-www-claim · OPTIONAL (paginated endpoints)</label>
				<input style={inputStyle} value={form.wwwClaim || ""} onChange={(e) => set("wwwClaim")(e.target.value)} placeholder="hmac.AR..." />
			</div>

			{error ? <div style={{ marginTop: 12 }}><ErrorRow err={error} /></div> : null}

			<div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
				<button type="button" className="btn btn-sm btn-ghost" onClick={() => { setOpen(false); setForm({}); setError(null); }}>
					CANCEL
				</button>
				<button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
					{busy ? "SAVING…" : "SAVE SESSION"}
				</button>
			</div>
		</form>
	);
};
