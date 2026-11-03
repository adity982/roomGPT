import ClientReview from "../../../components/studio/ClientReview";
export const metadata = {
  title: "Client proposal | roomGPT Studio",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <ClientReview token={(await params).token} />;
}
