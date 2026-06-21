import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getSnapshot, publicBaseUrl } from "@/src/lib/store";

// Dedupe the store read across generateMetadata() + the page body within one
// request (Next only dedupes fetch(), not arbitrary async calls).
const loadSnapshot = cache((token: string) => getSnapshot(token));

type PageProps = { params: Promise<{ resultToken: string }> };
const unavailableDescription = "This Sayable result link is expired, deleted, or no longer privacy-safe.";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { resultToken } = await params;
  const image = `/api/og/check/${resultToken}`;
  const canonicalUrl = `${publicBaseUrl()}/r/${resultToken}`;
  try {
    const { check, result } = await loadSnapshot(resultToken);
    const description = `${check.draft.activityLabel} Comfort Check result - ${result.publicSnapshot.detail}`;
    return {
      title: `${check.title} Comfort Check result`,
      description,
      alternates: {
        canonical: canonicalUrl
      },
      openGraph: {
        title: `${check.title} Comfort Check result`,
        description,
        url: canonicalUrl,
        images: [image]
      },
      twitter: {
        card: "summary_large_image",
        title: `${check.title} Comfort Check result`,
        description,
        images: [image]
      },
      other: {
        "twitter:url": canonicalUrl
      }
    };
  } catch {
    const unavailableUrl = `${publicBaseUrl()}/r/unavailable`;
    const unavailableImage = "/api/og/check/unavailable";
    return {
      title: "Comfort Check result unavailable",
      description: unavailableDescription,
      alternates: {
        canonical: unavailableUrl
      },
      openGraph: {
        title: "Comfort Check result unavailable",
        description: unavailableDescription,
        url: unavailableUrl,
        images: [unavailableImage]
      },
      twitter: {
        card: "summary_large_image",
        title: "Comfort Check result unavailable",
        description: unavailableDescription,
        images: [unavailableImage]
      },
      other: {
        "twitter:url": unavailableUrl
      }
    };
  }
}

export default async function ResultSnapshotPage({ params }: PageProps) {
  const { resultToken } = await params;
  let snapshot: Awaited<ReturnType<typeof getSnapshot>>;
  try {
    snapshot = await loadSnapshot(resultToken);
  } catch {
    notFound();
  }

  const { check, result } = snapshot;
  return (
    <main className="page-shell section-band rise">
      <section className="snapshot stack">
        <div className="theme-icon-badge" aria-hidden>
          ✦
        </div>
        <span className="pill">Sayable public-safe result</span>
        <h1 className="compact-title">{check.title}</h1>
        <h2 className={`verdict-chip tone-${result.publicSnapshot.tone ?? "neutral"}`}>{result.publicSnapshot.headline}</h2>
        <p className="muted">{result.publicSnapshot.detail}</p>
        <div className="grid-three">
          {result.publicSnapshot.safeStats.map((stat) => (
            <div className="status-note" key={stat}>
              {stat}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
