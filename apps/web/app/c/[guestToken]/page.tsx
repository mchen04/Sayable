import type { Metadata } from "next";
import GuestCheckClient from "@/components/GuestCheckClient";
import { getPublicCheck, publicBaseUrl } from "@/src/lib/store";

type PageProps = { params: Promise<{ guestToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { guestToken } = await params;
  const canonicalUrl = `${publicBaseUrl()}/c/${guestToken}`;
  const unavailable = {
    title: "Comfort Check unavailable",
    description: "This Sayable guest link is expired, deleted, or no longer available.",
    alternates: {
      canonical: canonicalUrl
    },
    openGraph: {
      title: "Comfort Check unavailable",
      description: "This Sayable guest link is expired, deleted, or no longer available.",
      url: canonicalUrl,
      images: [`/api/og/check/${guestToken}`]
    },
    twitter: {
      card: "summary_large_image" as const,
      title: "Comfort Check unavailable",
      description: "This Sayable guest link is expired, deleted, or no longer available.",
      images: [`/api/og/check/${guestToken}`]
    },
    other: {
      "twitter:url": canonicalUrl
    }
  };
  try {
    const { check } = await getPublicCheck(guestToken);
    if (check.status !== "active") {
      const description = `${check.draft.activityLabel} Comfort Check is no longer accepting responses.`;
      return {
        ...unavailable,
        title: `${check.title} Comfort Check unavailable`,
        description,
        openGraph: {
          ...unavailable.openGraph,
          title: `${check.title} Comfort Check unavailable`,
          description
        },
        twitter: {
          ...unavailable.twitter,
          title: `${check.title} Comfort Check unavailable`,
          description
        }
      };
    }
    return {
      title: `${check.title} Comfort Check`,
      description: `${check.draft.activityLabel} - private answers, group-safe result.`,
      alternates: {
        canonical: canonicalUrl
      },
      openGraph: {
        title: `${check.title} Comfort Check`,
        description: `${check.draft.activityLabel} - private answers, group-safe result.`,
        url: canonicalUrl,
        images: [`/api/og/check/${guestToken}`]
      },
      twitter: {
        card: "summary_large_image",
        title: `${check.title} Comfort Check`,
        description: `${check.draft.activityLabel} - private answers, group-safe result.`
      },
      other: {
        "twitter:url": canonicalUrl
      }
    };
  } catch {
    return unavailable;
  }
}

export default async function GuestCheckPage({ params }: PageProps) {
  const { guestToken } = await params;
  return <GuestCheckClient guestToken={guestToken} />;
}
