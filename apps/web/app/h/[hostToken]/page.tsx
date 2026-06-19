import type { Metadata } from "next";
import HostResultsClient from "@/components/HostResultsClient";
import { hostTokenResultsEndpoints } from "@/components/host-endpoints";

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
  return <HostResultsClient endpoints={hostTokenResultsEndpoints(hostToken)} />;
}
