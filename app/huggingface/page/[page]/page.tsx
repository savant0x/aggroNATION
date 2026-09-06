import { notFound } from "next/navigation";

import TypeListingPage from "../../../type-listing-page";

export const revalidate = 60;

// FID-2026-0905-007: deep pages of the HIGHLIGHTS view (page 1 lives at
// /huggingface). Page-able diversification walks deeper items per source.
export function generateStaticParams() {
  return [];
}

export default async function HuggingfacePageN({
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
      segment="huggingface"
      sourceType="huggingface"
      sort="highlights"
      page={n}
    />
  );
}
