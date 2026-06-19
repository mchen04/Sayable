import type { Metadata } from "next";
import HostResultsClient from "@/components/HostResultsClient";

type PageProps = { params: Promise<{ checkId: string }> };

export const metadata: Metadata = {
  title: "Saved Comfort Check results",
  robots: { index: false, follow: false, nocache: true }
};

export default async function DashboardCheckResultsPage({ params }: PageProps) {
  const { checkId } = await params;
  return (
    <HostResultsClient
      apiPath={`/api/dashboard/checks/${checkId}`}
      reviewPath={`/dashboard/checks/${checkId}/review`}
      finalSharePath={`/api/dashboard/checks/${checkId}/final-share`}
      requiresAuth
    />
  );
}
