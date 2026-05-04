"use client";

import { useMemo, useState } from "react";

type AvatarShape = {
	id?: string;
	color?: string;
	initials?: string;
	profilePicUrl?: string | null;
};

type Props = {
	inf: AvatarShape;
	size?: "md" | "lg" | "xl";
};

const palette = ["#22d3ee", "#ec4899", "#22d39d", "#ffd166"];

export const Avatar = ({ inf, size = "md" }: Props) => {
	const cls = size === "xl" ? "av xl" : size === "lg" ? "av lg" : "av";
	const [broken, setBroken] = useState(false);

	const grad = useMemo(() => {
		const a = inf.color || "#8b5cf6";
		const b = palette[(inf.id || "").length % palette.length];
		return `linear-gradient(135deg, ${a}, ${b})`;
	}, [inf.color, inf.id]);

	return (
		<div className={cls} style={{ background: grad }}>
			{inf.profilePicUrl && !broken ? (
				/* eslint-disable-next-line @next/next/no-img-element */
				<img
					src={inf.profilePicUrl}
					alt=""
					loading="lazy"
					onError={() => setBroken(true)}
				/>
			) : (
				<span style={{ position: "relative", zIndex: 1 }}>{inf.initials}</span>
			)}
		</div>
	);
};
