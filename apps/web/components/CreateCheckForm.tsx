"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACTIVITY_TYPES, VIBES, activityLabel, type ActivityType, type Vibe } from "@sayable/core";
import { ArrowRight, ClipboardList, MessageCircle } from "lucide-react";
import { existingAuthHeaders, getHostSession } from "./client-utils";

const vibeLabels: Record<Vibe, string> = {
  low_key: "Low-key",
  celebratory: "Celebratory",
  adventurous: "Adventurous",
  cozy: "Cozy",
  polished: "Polished",
  spontaneous: "Spontaneous"
};

export default function CreateCheckForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("dinner_drinks");
  const [currentIdea, setCurrentIdea] = useState("");
  const [vibe, setVibe] = useState<Vibe | "">("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function rememberHostToken(hostToken: string, checkId?: string) {
    const key = "sayable_recent_host_tokens";
    const existing = JSON.parse(window.localStorage.getItem(key) || "[]") as string[];
    window.localStorage.setItem(key, JSON.stringify(Array.from(new Set([hostToken, ...existing])).slice(0, 8)));
    if (checkId) {
      const mapKey = "sayable_host_token_by_check_id";
      const map = JSON.parse(window.localStorage.getItem(mapKey) || "{}") as Record<string, string>;
      window.localStorage.setItem(mapKey, JSON.stringify({ ...map, [checkId]: hostToken }));
    }
  }

  function getCreatorNonce(): string {
    const key = "sayable_creator_nonce";
    const existing = window.localStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  }

  async function submit(forceHostSession = false) {
    setIsLoading(true);
    setError("");
    try {
      if (forceHostSession) {
        await getHostSession();
      }
      const headers = await existingAuthHeaders();
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          title,
          activityType,
          currentIdea: currentIdea || undefined,
          vibe: vibe || undefined,
          ...(!headers.Authorization ? { creatorNonce: getCreatorNonce() } : {})
        })
      });
      const data = (await response.json()) as { hostToken?: string; check?: { id: string }; error?: string };
      if (!response.ok || !data.hostToken) {
        throw new Error(data.error || "Could not create this Comfort Check.");
      }
      rememberHostToken(data.hostToken, data.check?.id);
      router.push(`/checks/${data.hostToken}/review`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create this Comfort Check.");
    } finally {
      setIsLoading(false);
    }
  }

  const capError = error.includes("active Comfort Checks");

  return (
    <section className="form-panel" aria-label="Create a Comfort Check">
      <div className="stack">
        <span className="pill">
          <ClipboardList size={15} aria-hidden />
          Comfort Check
        </span>
        {!compact ? (
          <div>
            <h2 className="compact-title">Start with the plan, not a survey.</h2>
            <p className="muted">
              Sayable drafts the questions, comfort tiers, constraints, privacy copy, and group-chat share text.
            </p>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="title">Plan title</label>
          <input
            id="title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Friday dinner before the show"
            autoComplete="off"
          />
        </div>
        <div className="grid-two">
          <div className="field">
            <label htmlFor="activity">Activity</label>
            <select
              id="activity"
              value={activityType}
              onChange={(event) => setActivityType(event.target.value as ActivityType)}
            >
              {ACTIVITY_TYPES.map((type) => (
                <option value={type} key={type}>
                  {activityLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="vibe">Vibe</label>
            <select id="vibe" value={vibe} onChange={(event) => setVibe(event.target.value as Vibe | "")}>
              <option value="">No vibe selected</option>
              {VIBES.map((item) => (
                <option value={item} key={item}>
                  {vibeLabels[item]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="idea">Current idea or price</label>
          <input
            id="idea"
            value={currentIdea}
            maxLength={160}
            onChange={(event) => setCurrentIdea(event.target.value)}
            placeholder="$45/person, 7pm, or still flexible"
          />
        </div>
        {error ? (
          <div className="error-note" id="create-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="button-row">
          <button className="btn btn-primary" type="button" onClick={() => submit()} disabled={isLoading}>
            <MessageCircle size={18} aria-hidden />
            {isLoading ? "Drafting..." : "Create a Comfort Check"}
            <ArrowRight size={18} aria-hidden />
          </button>
          <a className="btn btn-secondary" href="#example-flow">
            See example flow
          </a>
          {capError ? (
            <>
              <button className="btn btn-secondary" type="button" onClick={() => submit(true)} disabled={isLoading}>
                Continue with Google to create
              </button>
              <Link className="btn btn-ghost" href="/dashboard">
                Manage saved checks
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
