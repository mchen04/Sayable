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

export default function DashboardClient() {
  const [checks, setChecks] = useState<DashboardCheck[]>([]);
  const [ownerUserId, setOwnerUserId] = useState("");

  useEffect(() => {
    getHostSession()
      .then(async (session) => {
        setOwnerUserId(session.ownerUserId);
        const headers = await authHeaders();
        return fetch("/api/dashboard", { headers });
      })
      .then((response) => response.json())
      .then((payload: { checks?: DashboardCheck[] }) => {
        setChecks(payload.checks || []);
      })
      .catch(() => setChecks([]));
  }, []);

  return (
    <main className="page-shell section-band stack">
      <div className="section-heading">
        <span className="pill">Host dashboard</span>
        <h1 className="compact-title">Saved Comfort Checks</h1>
        <p>
          Saved checks stay tied to your host session so you can reopen results, manage active checks, and upgrade when a
          plan needs more room. Session <code>{maskedOwnerId(ownerUserId)}</code>.
        </p>
      </div>
      <div className="dashboard-list">
        {checks.length ? (
          checks.map((check) => (
            <article className="tool-panel" key={check.id}>
              <span className="pill">{check.plan}</span>
              <h2>{check.title}</h2>
              <p className="muted">
                {check.activityType} · {check.status} · updated {new Date(check.updatedAt).toLocaleString()}
              </p>
              <div className="button-row">
                <Link className="btn btn-secondary" href={check.reviewUrl}>
                  Review
                </Link>
                <Link className="btn btn-ghost" href={check.resultsUrl}>
                  Results
                </Link>
              </div>
            </article>
          ))
        ) : (
          <div className="status-note">No saved checks yet. Create a check, then choose Continue with Google.</div>
        )}
      </div>
      <Link className="btn btn-primary" href="/create">
        Create a Comfort Check
      </Link>
    </main>
  );
}
