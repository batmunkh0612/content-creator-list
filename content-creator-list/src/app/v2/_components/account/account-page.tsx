"use client";

import { useState } from "react";
import { useAuth } from "@/auth/auth-context";
import { Icon } from "@/components/v2/icon";
import { PasswordField } from "./password-field";

const validate = (cur: string, next: string, confirm: string): string | null => {
	if (next !== confirm) return "New password and confirmation do not match.";
	if (next.length < 8) return "New password must be at least 8 characters.";
	if (next === cur) return "New password must differ from your current password.";
	return null;
};

export const AccountPage = () => {
	const { user, changePassword } = useAuth();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [ok, setOk] = useState(false);

	const reset = () => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); };

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setOk(false);
		const validationError = validate(currentPassword, newPassword, confirmPassword);
		if (validationError) { setError(validationError); return; }
		setSubmitting(true);
		try {
			await changePassword({ currentPassword, newPassword });
			setOk(true);
			reset();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to change password");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div style={{ maxWidth: 560 }}>
			<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
				SETTINGS
			</div>
			<h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", margin: "4px 0 6px" }}>Account</h1>
			<p className="muted" style={{ fontSize: 13 }}>
				Signed in as <span style={{ color: "var(--tx-1)" }}>{user?.email}</span>
			</p>

			<div className="glass" style={{ padding: 24, marginTop: 24 }}>
				<div className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
					<Icon name="settings" size={11} /> CHANGE PASSWORD
				</div>

				<form onSubmit={submit} style={{ marginTop: 18 }}>
					<PasswordField label="CURRENT PASSWORD" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" required />
					<PasswordField label="NEW PASSWORD" hint="≥ 8 chars" value={newPassword} onChange={setNewPassword} autoComplete="new-password" required minLength={8} />
					<PasswordField label="CONFIRM NEW PASSWORD" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" required minLength={8} />

					{error && (
						<div style={{
							marginBottom: 14, padding: "10px 14px",
							background: "rgba(255,84,112,0.10)",
							border: "1px solid rgba(255,84,112,0.35)",
							borderRadius: 10,
							color: "#ff8aa0",
							fontFamily: "var(--mono)", fontSize: 12,
						}}>{error}</div>
					)}
					{ok && (
						<div style={{
							marginBottom: 14, padding: "10px 14px",
							background: "rgba(34,211,238,0.10)",
							border: "1px solid rgba(34,211,238,0.35)",
							borderRadius: 10,
							color: "#7dd3fc",
							fontFamily: "var(--mono)", fontSize: 12,
							letterSpacing: "0.04em",
						}}>✓ PASSWORD UPDATED · SESSION TOKEN REFRESHED</div>
					)}

					<button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: "100%" }}>
						{submitting ? "UPDATING…" : "UPDATE PASSWORD"}
					</button>
				</form>
			</div>

			<p className="mono muted" style={{ marginTop: 14, fontSize: 11, lineHeight: 1.6 }}>
				After a successful change your current browser session keeps working with a freshly issued token. Other devices still hold previously issued tokens until natural expiry (default <strong style={{ color: "var(--tx-2)" }}>7 days</strong>) — sign out of those devices manually if needed.
			</p>
		</div>
	);
};
