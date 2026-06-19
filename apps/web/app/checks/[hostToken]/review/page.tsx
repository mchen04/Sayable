import type { Metadata } from "next";
import HostReviewClient from "@/components/HostReviewClient";

type PageProps = { params: Promise<{ hostToken: string }> };

export const metadata: Metadata = {
  title: "Comfort Check host review",
  description: "Private Sayable host review and share controls.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Comfort Check host review",
    description: "Private Sayable host review and share controls.",
    images: ["/api/og/check/default"]
  },
  twitter: {
    card: "summary_large_image",
    title: "Comfort Check host review",
    description: "Private Sayable host review and share controls.",
    images: ["/api/og/check/default"]
  }
};

export default async function HostReviewPage({ params }: PageProps) {
  const { hostToken } = await params;
  return <HostReviewClient hostToken={hostToken} />;
}
