import type { Metadata } from "next";

import TypeListingPage from "@/app/type-listing-page";

export const metadata: Metadata = {
  title: "Trendshift",
  description:
    "Trending open-source repositories from Trendshift — aggregated in-site.",
};

export const revalidate = 60;

export default function TrendshiftPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; dir?: string }>;
}) {
  return (
    <TypeListingPage sourceType="trendshift" searchParams={searchParams} />
  );
}
