"use client";

import { useEffect, useRef, useState } from "react";
import { compactNum } from "@/lib/format";

type Props = {
	data: number[];
	height?: number;
	posColor?: string;
	negColor?: string;
};

export const AreaChart = ({ data, height = 180, posColor = "#22d39d", negColor = "#ff5470" }: Props) => {
	const ref = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(400);

	useEffect(() => {
		if (!ref.current) return;
		const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);

	const padL = 36, padR = 10, padT = 14, padB = 24;
	const innerW = Math.max(40, w - padL - padR);
	const innerH = height - padT - padB;
	const max = Math.max(...data.map(Math.abs)) * 1.2 || 1;
	const bw = (innerW / data.length) * 0.7;
	const gap = (innerW / data.length) * 0.3;
	const zeroY = padT + innerH / 2;

	return (
		<div ref={ref} style={{ width: "100%", height }}>
			<svg width={w} height={height} style={{ display: "block" }}>
				<line x1={padL} x2={padL + innerW} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4" />
				{data.map((v, i) => {
					const x = padL + i * (bw + gap) + gap / 2;
					const h = Math.abs(v / max) * (innerH / 2);
					const y = v >= 0 ? zeroY - h : zeroY;
					const color = v >= 0 ? posColor : negColor;
					return (
						<rect key={i} x={x} y={y} width={bw} height={Math.max(1, h)} rx="2" fill={color} opacity={0.85}>
							<title>{`${v >= 0 ? "+" : ""}${compactNum(v)}`}</title>
						</rect>
					);
				})}
			</svg>
		</div>
	);
};
