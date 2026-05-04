"use client";

import { useMemo } from "react";

type Props = {
	data: number[];
	w?: number;
	h?: number;
	color?: string;
	glow?: boolean;
};

export const Sparkline = ({ data, w = 80, h = 28, color = "#8b5cf6", glow = false }: Props) => {
	const id = useMemo(() => "sg" + Math.random().toString(36).slice(2, 8), []);
	if (!data?.length) return null;

	const min = Math.min(...data);
	const max = Math.max(...data);
	const span = max - min || 1;
	const stepX = w / (data.length - 1);
	const pts = data.map((v, i) => [i * stepX, h - ((v - min) / span) * (h - 4) - 2] as const);
	const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
	const area = `${d} L${w} ${h} L0 ${h} Z`;

	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
			<defs>
				<linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%"   stopColor={color} stopOpacity="0.45" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={area} fill={`url(#${id})`} />
			<path
				d={d}
				stroke={color}
				strokeWidth="1.5"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={glow ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
			/>
		</svg>
	);
};
