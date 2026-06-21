"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authHeaders, getHostSession } from "./client-utils";

interface DashboardCheck {
  id: string;
  title: string;
  activityType: string;
  plan: string;
  status: string;
  updatedAt: string;
  reviewUrl: string;
  resultsUrl: string;
}

function maskedOwnerId(ownerUserId: string): string {
  if (!ownerUserId) {
    return "loading";
  }
  return `${ownerUserId.slice(0, 10)}...${ownerUserId.slice(-6)}`;
}

function prettyKind(activityType: string): string {
  return activityType.replace(/[_-]+/g, " ").trim();
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "live" || normalized === "active") {
    return "tone-green";
  }
  if (normalized === "closed" || normalized === "expired" || normalized === "deleted") {
    return "tone-neutral";
  }
  return "tone-neutral";
}

export default function DashboardClient() {
  const [checks, setChecks] = useState<DashboardCheck[]>([]);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getHostSession()
      .then(async (session) => {
        setOwnerUserId(session.ownerUserId);
        const headers = await authHeaders();
        const response = await fetch("/api/dashboard", { headers });
        const payload = (await response.json().catch(() => ({}))) as {
          checks?: DashboardCheck[];
          error?: string;
        };
        if (!response.ok) {
          setError(payload.error || "Could not load your saved checks. Sign in again from a check you created.");
          return;
        }
        setChecks(payload.checks || []);
      })
      .catch(() => setError("Network error loading your dashboard. Check your connection and try again."));
  }, []);

  return (
    <main className="page-shell section-band rise">
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "flex-end",
          justifyContent: "space-between"
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">✦ your host session</div>
          <h1
            style={{
              fontFamily: "var(--type-display)",
              fontWeight: 800,
              fontSize: "clamp(2.4rem,5.5vw,4.2rem)",
              lineHeight: 0.92,
              letterSpacing: "-0.035em",
              margin: "14px 0 0"
            }}
          >
            Your <span className="serif serif-lime">checks</span>
          </h1>
          <p className="muted" style={{ fontSize: "1.12rem", margin: "14px 0 0", maxWidth: "52ch" }}>
            Everything you&apos;ve floated to the group. Session <code>{maskedOwnerId(ownerUserId)}</code>.
          </p>
        </div>
        <Link className="btn btn-primary" href="/create">
          + New check
        </Link>
      </header>

      {error ? (
        <div className="error-note" role="alert" style={{ marginTop: 24 }}>
          {error}
        </div>
      ) : null}

      <div className="dashboard-grid" style={{ marginTop: 28 }}>
        {checks.length ? (
          checks.map((check) => (
            <article className="dashboard-card" key={check.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span
                  style={{
                    fontFamily: "var(--type-mono)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted-ink-2)"
                  }}
                >
                  {prettyKind(check.activityType)}
                </span>
                <span className={`verdict-chip ${statusTone(check.status)}`} style={{ fontSize: "0.72rem", padding: "5px 10px" }}>
                  {check.status}
                </span>
              </div>
              <h3>{check.title}</h3>
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  updated {new Date(check.updatedAt).toLocaleDateString()}
                </span>
                <div className="button-row">
                  <Link className="btn btn-secondary" href={check.reviewUrl}>
                    Review
                  </Link>
                  <Link className="btn btn-ghost" href={check.resultsUrl}>
                    Results
                  </Link>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="status-note">No saved checks yet. Create a check, then choose Continue with Google.</div>
        )}
      </div>

      <div className="tool-panel" style={{ marginTop: 28, display: "flex", gap: 11, alignItems: "flex-start" }}>
        <span style={{ color: "var(--lime)", fontSize: "1.1rem", lineHeight: 1 }}>✦</span>
        <span style={{ color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--ink)" }}>It cleans up after itself.</strong> Checks and responses delete
          automatically after your retention window.
        </span>
      </div>
    </main>
  );
}
