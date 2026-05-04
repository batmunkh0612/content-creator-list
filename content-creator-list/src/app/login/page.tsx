import { Suspense } from "react";
import { LoginForm } from "./_components/login-form";

const Page = () => (
	<Suspense fallback={null}>
		<LoginForm />
	</Suspense>
);

export default Page;
