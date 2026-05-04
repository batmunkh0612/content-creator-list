import { Suspense, type ReactNode } from "react";
import { Protected } from "@/auth/protected";
import { Sidebar } from "./_components/sidebar";
import { TopNav } from "./_components/top-nav";

const V2Layout = ({ children }: { children: ReactNode }) => (
	<Protected>
		<div className="v2-root">
			<div className="ambient" />
			<div className="app">
				<Sidebar />
				<div className="main">
					<Suspense fallback={null}>
						<TopNav />
						<div className="scroll">{children}</div>
					</Suspense>
				</div>
			</div>
		</div>
	</Protected>
);

export default V2Layout;
