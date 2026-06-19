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

export default function BillingReturnClient({ sessionId, status }: { sessionId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Confirming Premium checkout...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function resolveReturn() {
      if (!sessionId) {
        setError("Checkout session is missing.");
        setMessage("");
        return;
      }
      try {
        const response = await fetch(`/api/billing/return?session_id=${encodeURIComponent(sessionId)}`, {
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
        const premiumStatus = status === "cancelled" ? "cancelled" : payload.status;
        router.replace(`/dashboard/checks/${payload.checkId}/review?premium=${premiumStatus}`);
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
    };
  }, [router, sessionId, status]);

  return (
    <main className="page-shell narrow">
      <section className="tool-panel">
        <span className="pill">
          <Crown size={15} aria-hidden />
          Premium Check
        </span>
        <h1>Checkout Return</h1>
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
