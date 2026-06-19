import type { Metadata } from "next";
import HostResultsClient from "@/components/HostResultsClient";
import { ownerResultsEndpoints } from "@/components/host-endpoints";

type PageProps = { params: Promise<{ checkId: string }> };

export const metadata: Metadata = {
  title: "Saved Comfort Check results",
  robots: { index: false, follow: false, nocache: true }
};

export default async function DashboardCheckResultsPage({ params }: PageProps) {
  const { checkId } = await params;
  return <HostResultsClient endpoints={ownerResultsEndpoints(checkId)} />;
}
