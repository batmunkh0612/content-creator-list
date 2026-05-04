"use client";

import { useEffect, useRef, useState } from "react";
import { compactNum } from "@/lib/format";

type Props = {
	value: number;
	format?: (n: number) => string;
	duration?: number;
};

export const AnimatedCounter = ({ value, format, duration = 900 }: Props) => {
	const [v, setV] = useState(value);
	const startRef = useRef(value);
	const fmt = format || ((n: number) => compactNum(n));

	useEffect(() => {
		const start = performance.now();
		const from = startRef.current;
		const to = value;
		let raf = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - Math.pow(1 - t, 3);
			const cur = from + (to - from) * eased;
			setV(cur);
			if (t < 1) raf = requestAnimationFrame(tick);
			else startRef.current = to;
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [value, duration]);

	return <>{fmt(Math.round(v))}</>;
};
