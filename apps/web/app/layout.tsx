import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Hanken_Grotesk, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import WebAnalytics from "@/components/WebAnalytics";
import DockNav from "@/components/DockNav";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap"
});
const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap"
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic"],
  variable: "--font-serif",
  display: "swap"
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-mono",
  display: "swap"
});

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
    description: "A private group-chat vibe check before you lock in a plan.",
    images: ["/api/og/check/default"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15120D"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <WebAnalytics />
        <div className="grain" aria-hidden />
        <header className="site-header">
          <Link href="/" className="brand-mark" aria-label="Sayable home">
            <span className="brand-word">Sayable</span>
            <span className="brand-star" aria-hidden>
              ✦
            </span>
          </Link>
          <span className="brand-badge">no login, ever ✦</span>
        </header>
        {children}
        <footer className="page-shell footer-links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
          <Link href="/delete">Delete my data</Link>
        </footer>
        <DockNav />
      </body>
    </html>
  );
}
