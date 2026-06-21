"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { postAnalytics } from "./client-io";

function analyticsRoute(pathname: string): string {
  if (pathname.startsWith("/c/")) {
    return "/c/[guestToken]";
  }
  if (pathname.startsWith("/h/")) {
    return "/h/[hostToken]";
  }
  if (pathname.startsWith("/r/")) {
    return "/r/[resultToken]";
  }
  if (pathname.startsWith("/checks/") && pathname.endsWith("/review")) {
    return "/checks/[hostToken]/review";
  }
  return pathname || "/";
}

export default function WebAnalytics() {
  const pathname = usePathname();
  const lastSentRoute = useRef<string | null>(null);

  useEffect(() => {
    const route = analyticsRoute(pathname);
    // Skip duplicate beacons (e.g. back/forward to the same logical route, or
    // re-renders) so each pageview is a single write, not one per re-render.
    if (lastSentRoute.current === route) {
      return;
    }
    lastSentRoute.current = route;
    void postAnalytics("web_opened", { route });
  }, [pathname]);

  return null;
}
