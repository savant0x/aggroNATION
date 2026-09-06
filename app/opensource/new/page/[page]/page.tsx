import { notFound } from "next/navigation";

import TypeListingPage from "../../../../type-listing-page";

export const revalidate = 60;

// FID-2026-0905-007: deep pages of the STRICT view (page 1 lives at
// /opensource/new). Raw newest-first archive.
export function generateStaticParams() {
  return [];
}

export default async function OpensourceNewPageN({
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
      segment="opensource"
      sourceType="opensource"
      sort="strict"
      page={n}
    />
  );
}
