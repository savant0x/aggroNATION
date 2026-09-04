import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export default function RedditPage() {
  return <TypeListingPage segment="reddit" sourceType="reddit" page={1} />;
}
