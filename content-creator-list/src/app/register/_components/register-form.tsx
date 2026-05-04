"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/auth-context";
import { ErrorRow } from "@/components/v2/error-row";
import { AuthShell } from "@/app/login/_components/auth-shell";
import { AuthInput } from "@/app/login/_components/auth-input";

export const RegisterForm = () => {
	const { register } = useAuth();
	const router = useRouter();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<unknown>(null);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			await register({ email, password, name: name || undefined });
			router.replace("/v2");
		} catch (err) {
			setError(err);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<AuthShell
			eyebrow="— PROVISION WORKSPACE"
			title="Create account"
			subtitle="No email verification · ready in < 5 seconds"
		>
			<form onSubmit={submit}>
				<AuthInput label="NAME · OPTIONAL" value={name} onChange={setName} placeholder="Ada Lovelace" />
				<AuthInput
					label="EMAIL"
					type="email"
					value={email}
					onChange={setEmail}
					placeholder="you@company.com"
					autoComplete="email"
					required
				/>
				<AuthInput
					label="PASSWORD"
					hint="≥ 8 chars"
					type="password"
					value={password}
					onChange={setPassword}
					placeholder="••••••••"
					autoComplete="new-password"
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
					{submitting ? "PROVISIONING…" : "CREATE ACCOUNT →"}
				</button>

				<p className="mono" style={{ marginTop: 16, fontSize: 12, color: "var(--tx-3)", textAlign: "center" }}>
					ALREADY REGISTERED?{" "}
					<Link href="/login" style={{ color: "var(--tx-1)", borderBottom: "1px solid var(--tx-1)" }}>
						SIGN IN
					</Link>
				</p>
			</form>
		</AuthShell>
	);
};
