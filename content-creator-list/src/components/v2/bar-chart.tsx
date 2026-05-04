"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compactNum } from "@/lib/format";

type Props = {
	data: number[];
	height?: number;
	color?: string;
	// Optional per-bar caption shown in the hover tooltip (e.g. post date,
	// "post #5", "12 days"). Length should match `data.length`.
	labels?: string[];
	// How the value renders in the tooltip + y-axis. Default = compactNum.
	formatValue?: (v: number) => string;
	// Y-axis tick suffix — '%' for engagement charts, '' for raw counts.
	yAxisSuffix?: string;
};

type Hover = { i: number; x: number; y: number; v: number; w: number; h: number } | null;

const tooltipStyle: React.CSSProperties = {
	position: "absolute",
	padding: "8px 10px",
	background: "rgba(15,15,25,0.94)",
	backdropFilter: "blur(8px)",
	border: "1px solid rgba(255,255,255,0.16)",
	borderRadius: 8,
	fontSize: 12,
	fontFamily: "var(--mono)",
	pointerEvents: "none",
	boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
	whiteSpace: "nowrap",
	zIndex: 5,
};

export const BarChart = ({
	data, height = 200, color = "#22d3ee",
	labels, formatValue, yAxisSuffix = "",
}: Props) => {
	const ref = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(400);
	const [hover, setHover] = useState<Hover>(null);
	const id = useMemo(() => "bc" + Math.random().toString(36).slice(2, 8), []);
	const fmt = formatValue || ((v: number) => compactNum(v));

	useEffect(() => {
		if (!ref.current) return;
		const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);

	const padL = 40, padR = 10, padT = 14, padB = 24;
	const innerW = Math.max(40, w - padL - padR);
	const innerH = height - padT - padB;
	const peak = Math.max(...data, 0);
	const max = Math.max(0.001, peak * 1.15);
	const bw = (innerW / Math.max(1, data.length)) * 0.66;
	const gap = (innerW / Math.max(1, data.length)) * 0.34;

	// Translate any pointer position to the nearest bar so hovering anywhere
	// over a bar's column (not just the rect itself) lights it up.
	const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!ref.current || !data.length) return;
		const rect = ref.current.getBoundingClientRect();
		const x = e.clientX - rect.left - padL;
		const colW = innerW / data.length;
		const i = Math.max(0, Math.min(data.length - 1, Math.floor(x / colW)));
		const v = data[i];
		const h = (v / max) * innerH;
		setHover({
			i,
			x: padL + i * (bw + gap) + gap / 2,
			y: padT + innerH - h,
			v,
			w: bw,
			h,
		});
	};

	// Place the tooltip horizontally next to the bar, but flip to the left
	// side when we're near the right edge so it stays on screen.
	const tipLeft = hover
		? Math.min(Math.max(hover.x + bw + 8, 8), Math.max(8, w - 220))
		: 0;
	const tipTop = hover ? Math.max(8, hover.y - 6) : 0;

	return (
		<div
			ref={ref}
			onMouseMove={onMove}
			onMouseLeave={() => setHover(null)}
			style={{ width: "100%", height, position: "relative" }}
		>
			<svg width={w} height={height} style={{ display: "block" }}>
				<defs>
					<linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%"   stopColor={color} stopOpacity="1" />
						<stop offset="100%" stopColor={color} stopOpacity="0.3" />
					</linearGradient>
				</defs>

				{[0, 0.5, 1].map((p) => {
					const y = padT + innerH * (1 - p);
					return <line key={p} x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />;
				})}
				<text x={padL - 8} y={padT + 4}      textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="var(--mono)">
					{fmt(peak) + yAxisSuffix}
				</text>
				<text x={padL - 8} y={padT + innerH} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="var(--mono)">
					0
				</text>

				{data.map((v, i) => {
					const h = (v / max) * innerH;
					const x = padL + i * (bw + gap) + gap / 2;
					const y = padT + innerH - h;
					const active = hover?.i === i;
					return (
						<rect
							key={i}
							x={x} y={y}
							width={bw} height={Math.max(1, h)}
							rx="3"
							fill={`url(#${id})`}
							opacity={hover && !active ? 0.55 : 1}
							stroke={active ? "rgba(255,255,255,0.85)" : "none"}
							strokeWidth={active ? 1 : 0}
						/>
					);
				})}

				{/* Vertical guide for the hovered column. Helps reading off the
				    y-axis when the bar is short. */}
				{hover && (
					<line
						x1={hover.x + bw / 2} x2={hover.x + bw / 2}
						y1={padT}              y2={padT + innerH}
						stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3"
					/>
				)}
			</svg>

			{hover && (
				<div style={{ ...tooltipStyle, left: tipLeft, top: tipTop }}>
					<div style={{ color: "var(--tx-1)", fontWeight: 600 }}>
						{fmt(hover.v)}{yAxisSuffix}
					</div>
					<div style={{ color: "var(--tx-3)", fontSize: 10, marginTop: 2 }}>
						{labels?.[hover.i] ?? `#${hover.i + 1}`}
					</div>
				</div>
			)}
		</div>
	);
};
