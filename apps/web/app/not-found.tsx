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
    <main className="page-shell section-band stack" style={{ paddingTop: "clamp(20px,3vw,40px)" }}>
      <div className="eyebrow">404 ✦ link unavailable</div>
      <h1 className="compact-title">
        This Comfort Check link is <span className="serif serif-lime">no longer</span> available.
      </h1>
      <p className="muted" style={{ fontSize: "1.12rem", maxWidth: "52ch" }}>
        It may have expired, been deleted, or been replaced with a newer privacy-safe share link.
      </p>
      <Link className="btn btn-primary" href="/">
        Create a new Comfort Check
      </Link>
    </main>
  );
}
