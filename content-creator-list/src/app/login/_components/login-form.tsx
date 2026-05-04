"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/auth/auth-context";
import { ErrorRow } from "@/components/v2/error-row";
import { AuthShell } from "./auth-shell";
import { AuthInput } from "./auth-input";

export const LoginForm = () => {
	const { login } = useAuth();
	const router = useRouter();
	const search = useSearchParams();
	const next = search.get("next") || "/v2";

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<unknown>(null);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			await login({ email, password });
			router.replace(next);
		} catch (err) {
			setError(err);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<AuthShell
			eyebrow="— ENTER WORKSPACE"
			title="Sign in"
			subtitle="InfluPulse · v2.0"
		>
			<form onSubmit={submit}>
				<AuthInput
					label="EMAIL"
					type="email"
					value={email}
					onChange={setEmail}
					placeholder="you@company.com"
					autoComplete="email"
					required
					autoFocus
				/>
				<AuthInput
					label="PASSWORD"
					hint="≥ 8 chars"
					type="password"
					value={password}
					onChange={setPassword}
					placeholder="••••••••"
					autoComplete="current-password"
					required
					minLength={8}
				/>

				{error ? <ErrorRow err={error} /> : null}

				<button
					type="submit"
					disabled={submitting}
					className="btn btn-primary"
					style={{ width: "100%", marginTop: 6 }}
				>
					{submitting ? "AUTHENTICATING…" : "SIGN IN →"}
				</button>

				<p className="mono" style={{ marginTop: 16, fontSize: 12, color: "var(--tx-3)", textAlign: "center" }}>
					NO ACCOUNT?{" "}
					<Link href="/register" style={{ color: "var(--tx-1)", borderBottom: "1px solid var(--tx-1)" }}>
						CREATE ONE
					</Link>
				</p>
			</form>
		</AuthShell>
	);
};
