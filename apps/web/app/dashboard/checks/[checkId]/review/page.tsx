import type { Metadata } from "next";
import HostReviewClient from "@/components/HostReviewClient";
import { ownerReviewEndpoints } from "@/components/host-endpoints";

type PageProps = { params: Promise<{ checkId: string }> };

export const metadata: Metadata = {
  title: "Saved Comfort Check review",
  robots: { index: false, follow: false, nocache: true }
};

export default async function DashboardCheckReviewPage({ params }: PageProps) {
  const { checkId } = await params;
  return <HostReviewClient endpoints={ownerReviewEndpoints(checkId)} />;
}
