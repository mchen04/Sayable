import type { Metadata } from "next";
import Link from "next/link";

const unavailableDescription = "This Sayable result link is expired, deleted, or no longer privacy-safe.";
const unavailableUrl = `${process.env.NEXT_PUBLIC_WEB_BASE_URL || "http://localhost:3000"}/r/unavailable`;

export const metadata: Metadata = {
  title: "Comfort Check result unavailable",
  description: unavailableDescription,
  alternates: {
    canonical: unavailableUrl
  },
  openGraph: {
    title: "Comfort Check result unavailable",
    description: unavailableDescription,
    url: unavailableUrl,
    images: ["/api/og/check/unavailable"]
  },
  twitter: {
    card: "summary_large_image",
    title: "Comfort Check result unavailable",
    description: unavailableDescription,
    images: ["/api/og/check/unavailable"]
  },
  other: {
    "twitter:url": unavailableUrl
  }
};

export default function ResultNotFound() {
  return (
    <main className="page-shell section-band stack">
      <span className="pill">Sayable result unavailable</span>
      <h1 className="compact-title">This public result is no longer available.</h1>
      <p className="muted">
        Result links are removed when a Comfort Check is deleted or when changed responses make the snapshot no longer
        privacy-safe.
      </p>
      <Link className="btn" href="/">
        Create a new Comfort Check
      </Link>
    </main>
  );
}
