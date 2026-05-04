import type { ReactNode } from "react";
import { BrandMark } from "@/components/v2/brand-mark";

type Props = { eyebrow: string; title: string; subtitle: string; children: ReactNode };

export const AuthShell = ({ eyebrow, title, subtitle, children }: Props) => (
	<div className="v2-root" style={{ minHeight: "100vh" }}>
		<div className="ambient" />
		<div style={{
			position: "relative", zIndex: 1,
			minHeight: "100vh",
			display: "grid", placeItems: "center",
			padding: "48px 20px",
		}}>
			<div className="glass" style={{ width: "100%", maxWidth: 460, padding: 36 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
					<div className="brand-mark"><BrandMark /></div>
					<div className="brand-name">
						<b>Influ</b><span className="gloss">Pulse</span>
					</div>
				</div>
				<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
					{eyebrow}
				</div>
				<h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em", margin: "4px 0 6px" }}>
					{title}
				</h1>
				<p className="mono muted" style={{ fontSize: 12, marginTop: 4 }}>{subtitle}</p>
				<div style={{ marginTop: 24 }}>{children}</div>
			</div>
		</div>
	</div>
);
