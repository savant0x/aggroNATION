import { notFound } from "next/navigation";

import TypeListingPage from "../../../type-listing-page";

export const revalidate = 60;

// Pages ≥ 2 (FID-2026-0904-012 item 6). Non-numeric or < 2 paths 404 —
// page 1 lives at /reddit itself.
export function generateStaticParams() {
  return [];
}

export default async function RedditPageN({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 2) {
    notFound();
  }
  return <TypeListingPage segment="reddit" sourceType="reddit" page={n} />;
}
