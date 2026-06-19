import type { Metadata, Viewport } from "next";
import Link from "next/link";
import WebAnalytics from "@/components/WebAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_BASE_URL || "http://localhost:3000"),
  title: {
    default: "Sayable - Comfort Check",
    template: "%s | Sayable"
  },
  description: "Create a private Comfort Check, share it in Messages, and pick the plan that feels good for the group.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg"
  },
  openGraph: {
    title: "Sayable Comfort Check",
    description: "A private group-chat vibe check before you lock in a plan.",
    siteName: "Sayable",
    images: ["/api/og/check/default"]
  },
  twitter: {
    card: "summary_large_image",
    title: "Sayable Comfort Check",
    description: "A private group-chat vibe check before you lock in a plan."
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf8f2"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WebAnalytics />
        <header className="site-header">
          <Link href="/" className="brand-mark" aria-label="Sayable home">
            <span className="brand-glyph">S</span>
            <span>Sayable</span>
          </Link>
          <nav aria-label="Primary">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/support">Support</Link>
          </nav>
        </header>
        {children}
        <footer className="page-shell footer-links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
          <Link href="/delete">Deletion</Link>
          <Link href="/admin">Operator</Link>
        </footer>
      </body>
    </html>
  );
}
