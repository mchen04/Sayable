"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Screen = "home" | "create" | "answer" | "results" | "dash";

function activeScreen(pathname: string): Screen | null {
  if (pathname === "/") return "home";
  // /h/{token} renders the anonymous host RESULTS screen, so results must win
  // over the create/review branch (which owns /create and /checks/{token}/review).
  if (pathname.startsWith("/h/") || pathname.startsWith("/r/") || pathname.includes("/results")) return "results";
  // both review screens (/checks/{token}/review and /dashboard/checks/{id}/review)
  // render HostReviewClient and fold under the Create section.
  if (/\/review$/.test(pathname)) return "create";
  if (pathname.startsWith("/create") || pathname.startsWith("/checks/")) return "create";
  if (pathname.startsWith("/c/")) return "answer";
  if (pathname.startsWith("/dashboard")) return "dash";
  return null;
}

/**
 * Persistent bottom dock matching the Sayable design.
 * Home / Create / Checks are global destinations and always navigate.
 * Answer / Results are token-scoped (reached from a shared link), so they act
 * as the current-screen indicator and are inert when you are not on one.
 */
export default function DockNav() {
  const pathname = usePathname() || "/";
  const active = activeScreen(pathname);

  // Hide the dock on legal/support/utility pages where it is just noise.
  const hideOn = ["/privacy", "/terms", "/support", "/delete", "/admin", "/billing"];
  if (hideOn.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="dock" aria-label="Sections">
      <Link href="/" className={`dock-item${active === "home" ? " active" : ""}`} aria-current={active === "home" ? "page" : undefined}>
        Home
      </Link>
      <Link
        href="/create"
        className={`dock-item${active === "create" ? " active" : ""}`}
        aria-current={active === "create" ? "page" : undefined}
      >
        Create
      </Link>
      {active === "answer" ? (
        <span className="dock-item active" aria-current="page">
          Answer<span className="sr-only"> — current screen</span>
        </span>
      ) : (
        <span className="dock-item inert">
          Answer<span className="sr-only"> — opens from a shared Comfort Check link</span>
        </span>
      )}
      {active === "results" ? (
        <span className="dock-item active" aria-current="page">
          Results<span className="sr-only"> — current screen</span>
        </span>
      ) : (
        <span className="dock-item inert">
          Results<span className="sr-only"> — opens from your own check or a shared snapshot</span>
        </span>
      )}
      <Link
        href="/dashboard"
        className={`dock-item${active === "dash" ? " active" : ""}`}
        aria-current={active === "dash" ? "page" : undefined}
      >
        Checks
      </Link>
    </nav>
  );
}
