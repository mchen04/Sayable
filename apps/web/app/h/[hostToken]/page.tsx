import type { Metadata } from "next";
import HostResultsClient from "@/components/HostResultsClient";
import { getHostCheck, publicBaseUrl } from "@/src/lib/store";

type PageProps = { params: Promise<{ hostToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hostToken } = await params;
  const canonicalUrl = `${publicBaseUrl()}/h/${hostToken}`;
  try {
    const { check } = await getHostCheck(hostToken);
    const description = `${check.draft.activityLabel} Comfort Check host results.`;
    return {
      title: `${check.title} host results`,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title: `${check.title} host results`,
        description,
        url: canonicalUrl,
        images: [`/api/og/check/${hostToken}`]
      },
      twitter: {
        card: "summary_large_image",
        title: `${check.title} host results`,
        description,
        images: [`/api/og/check/${hostToken}`]
      },
      other: {
        "twitter:url": canonicalUrl
      }
    };
  } catch {
    const description = "This Sayable host link is expired, deleted, or no longer available.";
    return {
      title: "Comfort Check host link unavailable",
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title: "Comfort Check host link unavailable",
        description,
        url: canonicalUrl,
        images: [`/api/og/check/${hostToken}`]
      },
      twitter: {
        card: "summary_large_image",
        title: "Comfort Check host link unavailable",
        description,
        images: [`/api/og/check/${hostToken}`]
      },
      other: {
        "twitter:url": canonicalUrl
      }
    };
  }
}

export default async function HostResultsPage({ params }: PageProps) {
  const { hostToken } = await params;
  return <HostResultsClient hostToken={hostToken} />;
}
