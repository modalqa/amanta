import { SitePageView, siteMetadata } from "@/components/site-page";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const generateMetadata = ({ searchParams }: Props) => siteMetadata("tentang", searchParams);

export default function Page({ searchParams }: Props) {
  return <SitePageView slug="tentang" searchParams={searchParams} />;
}
