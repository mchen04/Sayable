"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { postAnalytics } from "./client-utils";

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

  useEffect(() => {
    void postAnalytics("web_opened", { route: analyticsRoute(pathname) });
  }, [pathname]);

  return null;
}
