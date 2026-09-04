import type { Metadata } from "next";

import TypeListingPage from "@/app/type-listing-page";

export const metadata: Metadata = {
  title: "GitHub",
  description:
    "Trending and newly-discovered open-source repositories from Trendshift and Open Source Projects — aggregated in-site.",
};

export const revalidate = 60;

export default function GithubPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; dir?: string }>;
}) {
  return (
    <TypeListingPage
      sourceTypes={["opensource", "trendshift"]}
      searchParams={searchParams}
    />
  );
}
