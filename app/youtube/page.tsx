import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export default function YouTubePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; dir?: string }>;
}) {
  return <TypeListingPage sourceType="youtube" searchParams={searchParams} />;
}
