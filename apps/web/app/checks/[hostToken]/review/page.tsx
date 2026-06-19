import type { Metadata } from "next";
import HostReviewClient from "@/components/HostReviewClient";
import { getHostCheck, publicBaseUrl } from "@/src/lib/store";

type PageProps = { params: Promise<{ hostToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hostToken } = await params;
  const canonicalUrl = `${publicBaseUrl()}/checks/${hostToken}/review`;
  try {
    const { check } = await getHostCheck(hostToken);
    const description = `${check.draft.activityLabel} Comfort Check host review and share controls.`;
    return {
      title: `${check.title} host review`,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title: `${check.title} host review`,
        description,
        url: canonicalUrl,
        images: [`/api/og/check/${hostToken}`]
      },
      twitter: {
        card: "summary_large_image",
        title: `${check.title} host review`,
        description,
        images: [`/api/og/check/${hostToken}`]
      },
      other: {
        "twitter:url": canonicalUrl
      }
    };
  } catch {
    const description = "This Sayable host review link is expired, deleted, or no longer available.";
    return {
      title: "Comfort Check host review unavailable",
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title: "Comfort Check host review unavailable",
        description,
        url: canonicalUrl,
        images: [`/api/og/check/${hostToken}`]
      },
      twitter: {
        card: "summary_large_image",
        title: "Comfort Check host review unavailable",
        description,
        images: [`/api/og/check/${hostToken}`]
      },
      other: {
        "twitter:url": canonicalUrl
      }
    };
  }
}

export default async function HostReviewPage({ params }: PageProps) {
  const { hostToken } = await params;
  return <HostReviewClient hostToken={hostToken} />;
}
