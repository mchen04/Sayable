import type { Metadata } from "next";
import Link from "next/link";

const unavailableDescription = "This Sayable Comfort Check link is expired, deleted, or no longer available.";

export const metadata: Metadata = {
  title: "Comfort Check unavailable",
  description: unavailableDescription,
  openGraph: {
    title: "Comfort Check unavailable",
    description: unavailableDescription,
    images: ["/api/og/check/unavailable"]
  },
  twitter: {
    card: "summary_large_image",
    title: "Comfort Check unavailable",
    description: unavailableDescription,
    images: ["/api/og/check/unavailable"]
  }
};

export default function NotFound() {
  return (
    <main className="page-shell section-band stack">
      <span className="pill">Sayable link unavailable</span>
      <h1 className="compact-title">This Comfort Check link is no longer available.</h1>
      <p className="muted">
        It may have expired, been deleted, or been replaced with a newer privacy-safe share link.
      </p>
      <Link className="btn" href="/">
        Create a new Comfort Check
      </Link>
    </main>
  );
}
