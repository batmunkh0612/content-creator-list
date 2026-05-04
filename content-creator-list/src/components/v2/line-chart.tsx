"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compactNum } from "@/lib/format";

type Props = {
	data: number[];
	height?: number;
	color?: string;
	label?: string;
};

type Hover = { i: number; x: number; y: number; v: number } | null;

export const LineChart = ({ data, height = 240, color = "#8b5cf6", label = "Followers" }: Props) => {
	const ref = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(640);
	const [hover, setHover] = useState<Hover>(null);
	const id = useMemo(() => "lc" + Math.random().toString(36).slice(2, 8), []);

	useEffect(() => {
		if (!ref.current) return;
		const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);

	const padL = 44, padR = 14, padT = 16, padB = 28;
	const innerW = Math.max(40, w - padL - padR);
	const innerH = height - padT - padB;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const span = max - min || 1;
	const stepX = innerW / Math.max(1, data.length - 1);
	const pts = data.map((v, i) => [padL + i * stepX, padT + innerH - ((v - min) / span) * innerH] as const);
	const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
	const area = `${d} L${padL + innerW} ${padT + innerH} L${padL} ${padT + innerH} Z`;
	const yLines = Array.from({ length: 5 }, (_, i) => {
		const v = min + (span * i) / 4;
		const y = padT + innerH - ((v - min) / span) * innerH;
		return { v, y };
	});

	const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!ref.current) return;
		const rect = ref.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const i = Math.round((x - padL) / stepX);
		if (i >= 0 && i < data.length) setHover({ i, x: pts[i][0], y: pts[i][1], v: data[i] });
	};

	return (
		<div ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ position: "relative", width: "100%", height }}>
			<svg width={w} height={height} style={{ display: "block" }}>
				<defs>
					<linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%"   stopColor={color} stopOpacity="0.4" />
						<stop offset="100%" stopColor={color} stopOpacity="0" />
					</linearGradient>
				</defs>
				{yLines.map((t, i) => (
					<g key={i}>
						<line x1={padL} x2={padL + innerW} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.05)" />
						<text x={padL - 8} y={t.y + 3} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="var(--mono)">
							{compactNum(t.v)}
						</text>
					</g>
				))}
				<path d={area} fill={`url(#${id})`} />
				<path d={d} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 8px ${color}88)` }} />
				{hover && (
					<g>
						<line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
						<circle cx={hover.x} cy={hover.y} r="4" fill={color} stroke="#0b0b12" strokeWidth="2" />
					</g>
				)}
			</svg>
			{hover && (
				<div style={{
					position: "absolute",
					left: Math.min(hover.x + 10, w - 140),
					top: hover.y - 10,
					padding: "8px 10px",
					background: "rgba(15,15,25,0.92)",
					backdropFilter: "blur(8px)",
					border: "1px solid rgba(255,255,255,0.14)",
					borderRadius: 8, fontSize: 12,
					fontFamily: "var(--mono)",
					pointerEvents: "none",
					boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
				}}>
					<div style={{ color: "var(--tx-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
					<div style={{ color: "var(--tx-1)", fontWeight: 600 }}>{compactNum(hover.v, true)}</div>
					<div style={{ color: "var(--tx-3)", fontSize: 10 }}>day {hover.i + 1}</div>
				</div>
			)}
		</div>
	);
};
