type Props = {
	label: string;
	hint?: string;
	value: string;
	onChange: (v: string) => void;
	autoComplete?: string;
	required?: boolean;
	minLength?: number;
};

export const PasswordField = ({ label, hint, value, onChange, autoComplete, required, minLength }: Props) => (
	<div style={{ marginBottom: 14 }}>
		<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
			<span className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
				{label}
			</span>
			{hint && (
				<span className="mono" style={{ fontSize: 10, color: "var(--tx-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
					{hint}
				</span>
			)}
		</div>
		<input
			type="password"
			autoComplete={autoComplete}
			required={required}
			minLength={minLength}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			style={{
				width: "100%", height: 40,
				padding: "0 14px",
				background: "rgba(255,255,255,0.04)",
				border: "1px solid var(--line-2)",
				borderRadius: 10,
				color: "var(--tx-1)",
				fontSize: 14, outline: "none",
				fontFamily: "inherit",
			}}
		/>
	</div>
);
