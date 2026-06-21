import type { Metadata } from "next";
import { cache } from "react";
import GuestCheckClient from "@/components/GuestCheckClient";
import { getPublicCheck, publicBaseUrl } from "@/src/lib/store";

// Dedupe the whole-store read across generateMetadata() + the page body within
// one request (Next only dedupes fetch(), not arbitrary async calls).
const loadPublicCheck = cache((token: string) => getPublicCheck(token));

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
    const { check } = await loadPublicCheck(guestToken);
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
        description: `${check.draft.activityLabel} - private answers, group-safe result.`,
        images: [`/api/og/check/${guestToken}`]
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
  // Seed the client with the check the server already loaded (same privacy-safe
  // fields the guest API returns — never token hashes) so the page renders
  // instantly with no client round-trip or loading flash on this shared link.
  let initialData = null;
  try {
    const { check, responseCount } = await loadPublicCheck(guestToken);
    initialData = {
      check: {
        title: check.title,
        plan: check.plan,
        status: check.status,
        draft: check.draft,
        themeId: check.themeId,
        ...(check.customTheme ? { customTheme: check.customTheme } : {}),
        expiresAt: check.expiresAt
      },
      responseCount
    };
  } catch {
    initialData = null;
  }
  return <GuestCheckClient guestToken={guestToken} initialData={initialData} />;
}
