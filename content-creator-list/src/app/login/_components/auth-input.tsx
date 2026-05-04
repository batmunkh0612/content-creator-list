type Props = {
	label: string;
	type?: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	autoComplete?: string;
	required?: boolean;
	minLength?: number;
	autoFocus?: boolean;
	hint?: string;
};

export const AuthInput = ({
	label, type = "text", value, onChange,
	placeholder, autoComplete, required, minLength, autoFocus, hint,
}: Props) => (
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
			type={type}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			autoComplete={autoComplete}
			required={required}
			minLength={minLength}
			autoFocus={autoFocus}
			style={{
				width: "100%", height: 42,
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
