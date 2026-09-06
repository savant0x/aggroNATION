import { notFound } from "next/navigation";

import TypeListingPage from "../../../type-listing-page";

export const revalidate = 60;

// FID-2026-0905-007: deep pages of the HIGHLIGHTS view (page 1 lives at
// /github). Page-able diversification walks deeper items per source.
export function generateStaticParams() {
  return [];
}

export default async function GithubPageN({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 2) {
    notFound();
  }
  return (
    <TypeListingPage
      segment="github"
      sourceTypes={["opensource", "trendshift"]}
      sort="highlights"
      page={n}
    />
  );
}
