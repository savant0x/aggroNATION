import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export default function RedditPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; dir?: string }>;
}) {
  return <TypeListingPage sourceType="reddit" searchParams={searchParams} />;
}
