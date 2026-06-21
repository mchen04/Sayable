"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Crown } from "lucide-react";
import { authHeaders } from "./client-utils";

interface CheckoutReturn {
  checkId: string;
  status: "started" | "completed" | "failed" | "cancelled";
  plan: "free" | "premium";
}

type CheckoutReturnStatus = "success" | "cancelled";

export default function BillingReturnClient({
  sessionId,
  returnStatus
}: {
  sessionId: string;
  returnStatus?: CheckoutReturnStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("Confirming Premium checkout...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let attempts = 0;
    async function resolveReturn() {
      if (!sessionId) {
        setError("Checkout session is missing.");
        setMessage("");
        return;
      }
      try {
        const params = new URLSearchParams({ session_id: sessionId });
        if (returnStatus) {
          params.set("status", returnStatus);
        }
        const response = await fetch(`/api/billing/return?${params}`, {
          headers: await authHeaders(),
          cache: "no-store"
        });
        const payload = (await response.json()) as CheckoutReturn & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Checkout could not be confirmed.");
        }
        if (cancelled) {
          return;
        }
        if (payload.status === "started") {
          attempts += 1;
          setMessage(
            attempts >= 8
              ? "Premium checkout is still pending. Open the dashboard to continue."
              : "Waiting for Stripe to confirm Premium checkout..."
          );
          if (attempts >= 8) {
            return;
          }
          retryTimer = window.setTimeout(() => {
            void resolveReturn();
          }, 1500);
          return;
        }
        router.replace(`/dashboard/checks/${payload.checkId}/review?premium=${payload.status}`);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Checkout could not be confirmed.");
          setMessage("");
        }
      }
    }
    void resolveReturn();
    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [returnStatus, router, sessionId]);

  return (
    <main className="page-shell section-band stack" style={{ paddingTop: "clamp(20px,3vw,40px)", maxWidth: 640 }}>
      <span className="pill">
        <Crown size={15} aria-hidden />
        Premium Check
      </span>
      <h1 className="compact-title">
        Checkout <span className="serif serif-lime">return</span>
      </h1>
      <section className="tool-panel stack">
        {message ? <p className="muted">{message}</p> : null}
        {error ? (
          <div className="error-note" role="alert">
            {error}
          </div>
        ) : null}
        <div className="button-row">
          <Link className="btn btn-primary" href="/dashboard">
            Open dashboard
            <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
