import { ApiError } from "@/lib/api";

type Props = { err: unknown };

export const ErrorRow = ({ err }: Props) => {
	let msg: string;
	if (err instanceof ApiError) {
		const detail = Array.isArray(err.details) && err.details.length ? ` — ${err.details.join("; ")}` : "";
		msg = `${err.message}${detail}`;
	} else if (err instanceof Error) {
		msg = err.message;
	} else {
		msg = String(err);
	}

	return (
		<div style={{
			marginTop: 12,
			padding: "10px 14px",
			background: "rgba(255,84,112,0.10)",
			border: "1px solid rgba(255,84,112,0.30)",
			borderRadius: 10,
			color: "#ff8aa0",
			fontFamily: "var(--mono)",
			fontSize: 12,
		}}>
			{msg}
		</div>
	);
};
