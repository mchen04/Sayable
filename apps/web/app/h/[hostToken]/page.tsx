import type { Metadata } from "next";
import HostResultsClient, { type HostResultData } from "@/components/HostResultsClient";
import { hostTokenResultsEndpoints } from "@/components/host-endpoints";
import { getHostCheck, serializeHostCheck } from "@/src/lib/store";

type PageProps = { params: Promise<{ hostToken: string }> };

export const metadata: Metadata = {
  title: "Comfort Check host results",
  description: "Private Sayable host results.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Comfort Check host results",
    description: "Private Sayable host results.",
    images: ["/api/og/check/default"]
  },
  twitter: {
    card: "summary_large_image",
    title: "Comfort Check host results",
    description: "Private Sayable host results.",
    images: ["/api/og/check/default"]
  }
};

export default async function HostResultsPage({ params }: PageProps) {
  const { hostToken } = await params;
  // Seed the client with the server-loaded result (same privacy-safe shape the
  // host API returns — serializeHostCheck redacts token hashes; the aggregate is
  // already privacy-gated) so the host's own results render with no loading flash.
  // Live updates still arrive via the client's poll / realtime subscription.
  let initialData: HostResultData | null = null;
  try {
    const data = await getHostCheck(hostToken);
    // serializeHostCheck redacts token hashes; this is exactly the payload the
    // host GET returns (the client's HostResultData shape), modulo TS's
    // exactOptionalPropertyTypes treatment of optional fields — hence the assertion.
    initialData = { ...data, check: serializeHostCheck(data.check) } as HostResultData;
  } catch {
    initialData = null;
  }
  return <HostResultsClient endpoints={hostTokenResultsEndpoints(hostToken)} initialData={initialData} />;
}
