"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACTIVITY_TYPES, activityLabel, type ActivityType, type Vibe } from "@sayable/core";
import { existingAuthHeaders, getHostSession } from "./client-utils";

/* The design's "money vibe" sets the tone of the plan — which in the core engine
   is exactly the `vibe` field. We map each tier to a real Vibe (never to the
   free-text price/currentIdea field, which would make the engine ask guests for
   "clearer price details" on every check). Budget amounts stay private by design. */
const BUDGETS = [
  { value: "low", label: "Easy on wallets", desc: "Keep it affordable", vibe: "low_key" },
  { value: "mid", label: "Mid-range", desc: "Comfortable, not fancy", vibe: "cozy" },
  { value: "high", label: "Treat night", desc: "We're splurging", vibe: "celebratory" }
] as const satisfies ReadonlyArray<{ value: string; label: string; desc: string; vibe: Vibe }>;

type BudgetValue = (typeof BUDGETS)[number]["value"];

export default function CreateCheckForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("dinner_drinks");
  // Opt-in: no tier selected by default, so a check isn't silently tagged with a
  // vibe the host never chose (submit() sends vibe:undefined when budget is null).
  const [budget, setBudget] = useState<BudgetValue | null>(null);
  const [currentIdea, setCurrentIdea] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      const vibe = BUDGETS.find((b) => b.value === budget)?.vibe;
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          title,
          activityType,
          vibe: vibe || undefined,
          currentIdea: currentIdea.trim() || undefined,
          ...(!headers.Authorization ? { creatorNonce: getCreatorNonce() } : {})
        })
      });
      const data = (await response.json()) as { hostToken?: string; error?: string };
      if (!response.ok || !data.hostToken) {
        throw new Error(data.error || "Could not create this Comfort Check.");
      }
      router.push(`/checks/${data.hostToken}/review`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create this Comfort Check.");
    } finally {
      setIsLoading(false);
    }
  }

  const capError = error.includes("active Comfort Checks");
  const previewTitle = title.trim() || "Friday dinner before the show";
  const chipStyle = (selected: boolean): CSSProperties => ({
    cursor: "pointer",
    padding: "10px 17px",
    borderRadius: 999,
    fontSize: "0.96rem",
    fontWeight: 700,
    border: `2px solid ${selected ? "#2E7D4F" : "var(--paper-line)"}`,
    background: selected ? "#E9F3EC" : "var(--paper-2)",
    color: selected ? "#1C5C3A" : "#3F392C",
    transition: "all .16s ease"
  });

  return (
    <main className="page-shell section-band rise" style={{ paddingTop: "clamp(20px,3vw,40px)" }}>
      <div className="eyebrow">Step 1 ✦ make a check</div>
      <h1 style={{ fontFamily: "var(--type-display)", fontWeight: 800, fontSize: "clamp(2.4rem,5.5vw,4.2rem)", lineHeight: 0.92, letterSpacing: "-0.035em", margin: "14px 0 0" }}>
        Start a <span className="serif serif-lime">Comfort</span> Check
      </h1>
      <p className="muted" style={{ fontSize: "1.12rem", margin: "14px 0 32px", maxWidth: "52ch" }}>
        Name the plan — we draft the questions, the comfort options, and a clean message for the chat. No login.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 22, alignItems: "start" }}>
        {/* form card */}
        <section className="form-panel" aria-label="Create a Comfort Check" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div className="field">
            <label htmlFor="title">What&apos;s the plan?</label>
            <input
              id="title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Friday dinner before the show"
              autoComplete="off"
              aria-invalid={capError || undefined}
              aria-describedby={error ? "create-error" : undefined}
            />
          </div>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="legend" style={{ marginBottom: 11 }}>
              What kind of thing is it?
            </legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {ACTIVITY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={activityType === type}
                  onClick={() => setActivityType(type)}
                  style={chipStyle(activityType === type)}
                >
                  {activityLabel(type)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="legend" style={{ marginBottom: 5 }}>
              Set the money vibe
            </legend>
            <div style={{ fontSize: "0.85rem", color: "var(--muted-ink-2)", marginBottom: 11 }}>
              Guests never see anyone&apos;s actual budget — this just sets the tone.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {BUDGETS.map((b) => {
                const selected = budget === b.value;
                return (
                  <button
                    key={b.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setBudget(selected ? null : b.value)}
                    style={{
                      flex: "1 1 150px",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: 14,
                      border: `2px solid ${selected ? "#2E7D4F" : "var(--paper-line)"}`,
                      background: selected ? "#E9F3EC" : "var(--paper-2)",
                      transition: "all .16s ease"
                    }}
                  >
                    <span style={{ display: "block", fontWeight: 700, fontSize: "1rem", color: "#1C1711" }}>{b.label}</span>
                    <span style={{ display: "block", fontSize: "0.85rem", color: "var(--muted-ink)", marginTop: 2 }}>{b.desc}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="current-idea">
              Anything specific in mind? <span style={{ fontWeight: 500, color: "var(--muted-ink)" }}>(optional)</span>
            </label>
            <input
              id="current-idea"
              value={currentIdea}
              maxLength={160}
              onChange={(event) => setCurrentIdea(event.target.value)}
              placeholder="e.g. $45/person, 7pm, or a spot you already love"
              autoComplete="off"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", background: "#EFE9DA", borderRadius: 13, fontSize: "0.88rem", color: "var(--muted-ink)" }}>
            ✦ Free — 30 responses · 2 custom topics · 30-day retention. Pick a look next.
          </div>

          {error ? (
            <div className="error-note" id="create-error" role="alert">
              {error}
            </div>
          ) : null}

          <button
            className="btn btn-secondary btn-block"
            type="button"
            onClick={() => submit()}
            disabled={isLoading || capError}
            aria-describedby={error ? "create-error" : undefined}
          >
            {isLoading ? "Drafting..." : "Looks good — get my link →"}
          </button>

          {capError ? (
            <div className="button-row">
              <button className="btn btn-primary" type="button" onClick={() => submit(true)} disabled={isLoading}>
                Continue with Google to create
              </button>
              <Link className="btn btn-ghost" href="/dashboard">
                Manage saved checks
              </Link>
            </div>
          ) : null}
        </section>

        {/* what lands in the chat */}
        <aside style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontFamily: "var(--type-mono)", fontWeight: 600, fontSize: 12, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8E8675" }}>
            What lands in the chat
          </div>
          <div className="share-card" style={{ transform: "rotate(2deg)", padding: 18 }}>
            <div className="chat-bubble">
              <div className="title">{previewTitle}</div>
              <div style={{ fontSize: "0.88rem", color: "var(--muted-ink)", lineHeight: 1.45 }}>
                Quick Comfort Check — one tap, fully private. No names, no budgets shown.
              </div>
              <div className="chat-url">✦ sayable.app/c/v7k2</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <span className="verdict-chip tone-green" style={{ fontSize: "0.78rem", padding: "6px 11px" }}>
                I&apos;m in
              </span>
              <span className="verdict-chip tone-yellow" style={{ fontSize: "0.78rem", padding: "6px 11px" }}>
                Maybe
              </span>
              <span className="verdict-chip tone-red" style={{ fontSize: "0.78rem", padding: "6px 11px" }}>
                I&apos;m out
              </span>
            </div>
          </div>
          <div className="tool-panel" style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ color: "var(--lime)", fontSize: "1.1rem", lineHeight: 1 }}>✦</span>
            <span style={{ color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--ink)" }}>Private by default.</strong> The link never shows names, anyone&apos;s budget, or
              private notes. You only ever see the group shape.
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}
