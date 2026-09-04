import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export default function RssPage() {
  return <TypeListingPage segment="rss" sourceType="rss" page={1} />;
}
