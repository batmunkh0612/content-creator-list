import { DetailPage } from "@/app/v2/_components/detail/detail-page";

type Props = {
	params: Promise<{ platform: string; username: string }>;
};

const Page = async ({ params }: Props) => {
	const { platform, username } = await params;
	return <DetailPage platform={platform} username={username} />;
};

export default Page;
