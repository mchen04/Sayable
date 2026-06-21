"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { type ComfortDraft, type PlanTier, type ResponseStatus } from "@sayable/core";
import { Check, Edit3, RotateCcw, Trash2 } from "lucide-react";

interface PublicCheckData {
  check: {
    title: string;
    plan: PlanTier;
    status: "active" | "closed" | "deleted" | "expired";
    draft: ComfortDraft;
    themeId: string;
    customTheme?: { accent: string; icon: string };
    expiresAt: string;
  };
  responseCount: number;
}

interface GuestResponseState {
  status: ResponseStatus;
  tierId: string;
  constraintIds: string[];
  privateNote: string;
}

const initialResponse: GuestResponseState = {
  status: "maybe",
  tierId: "works_with_tweaks",
  constraintIds: [],
  privateNote: ""
};

export default function GuestCheckClient({
  guestToken,
  initialData = null
}: {
  guestToken: string;
  initialData?: PublicCheckData | null;
}) {
  const [data, setData] = useState<PublicCheckData | null>(initialData);
  const [form, setForm] = useState<GuestResponseState>(initialResponse);
  const [responseToken, setResponseToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Tracked separately from `error` so a successful check load (which clears
  // `error`) does not silently swallow a failed saved-response reload.
  const [responseLoadFailed, setResponseLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isSaving, setIsSaving] = useState(false);

  const storageKey = `sayable_response_${guestToken}`;
  const nonceKey = `sayable_guest_nonce_${guestToken}`;

  function getClientNonce(): string {
    const existing = window.localStorage.getItem(nonceKey);
    if (existing) {
      return existing;
    }
    const created = crypto.randomUUID();
    window.localStorage.setItem(nonceKey, created);
    return created;
  }

  const loadResponse = useCallback(
    async (token: string) => {
      try {
        const response = await fetch(`/api/responses/${token}`, { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 404 || response.status === 410) {
            window.localStorage.removeItem(storageKey);
            setResponseToken("");
            setResponseLoadFailed(false);
            return;
          }
          setResponseLoadFailed(true);
          return;
        }
        const payload = (await response.json()) as GuestResponseState;
        setForm({
          status: payload.status,
          tierId: payload.tierId,
          constraintIds: payload.constraintIds,
          privateNote: payload.privateNote || ""
        });
        setResponseLoadFailed(false);
      } catch {
        setResponseLoadFailed(true);
      }
    },
    [storageKey]
  );

  const load = useCallback(async () => {
    setError("");
    setResponseLoadFailed(false);
    if (!initialData) {
      setIsLoading(true);
    }
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      setResponseToken(stored);
      await loadResponse(stored);
    }
    // When the server already seeded the check (initialData), skip the redundant
    // client fetch — it eliminates the double store-read and the loading flash.
    if (initialData) {
      setError("");
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/checks/guest/${guestToken}`, { cache: "no-store" });
      const payload = (await response.json()) as PublicCheckData & { error?: string };
      if (!response.ok) {
        setError(payload.error || "This Comfort Check could not be opened.");
        setIsLoading(false);
        return;
      }
      // The check loaded fine; clear any transient saved-response load error so it
      // doesn't render inside the otherwise-usable form.
      setError("");
      setData(payload);
      setIsLoading(false);
    } catch {
      setError("Network connection dropped while opening this Comfort Check. Try again.");
      setIsLoading(false);
    }
  }, [guestToken, loadResponse, storageKey, initialData]);

  useEffect(() => {
    // Call load() directly (matching DashboardClient). The old setTimeout(0) +
    // clearTimeout-in-cleanup idiom got cancelled by React 19 Strict Mode's
    // mount→cleanup→mount in dev, so the fetch never fired and the page stuck on
    // its loading state. A cancel flag keeps the late setState safe.
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function toggleConstraint(id: string) {
    setForm((current) => ({
      ...current,
      constraintIds: current.constraintIds.includes(id)
        ? current.constraintIds.filter((item) => item !== id)
        : [...current.constraintIds, id]
    }));
  }

  async function submit() {
    setIsSaving(true);
    setError("");
    setMessage("");
    const method = responseToken ? "PUT" : "POST";
    const url = responseToken ? `/api/responses/${responseToken}` : `/api/checks/guest/${guestToken}/responses`;
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(!responseToken ? { clientNonce: getClientNonce() } : {}) })
      });
      const payload = (await response.json()) as { responseToken?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not save your response.");
      }
      if (payload.responseToken) {
        window.localStorage.setItem(storageKey, payload.responseToken);
        setResponseToken(payload.responseToken);
      }
      setMessage(responseToken ? "Your private response was updated." : "Your private response was submitted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your response.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!responseToken) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/responses/${responseToken}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not delete your response.");
        return;
      }
      window.localStorage.removeItem(storageKey);
      setResponseToken("");
      setForm(initialResponse);
      setMessage("Your response was deleted.");
    } catch {
      setError("Network connection dropped before deleting your response. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="page-shell section-band">
        <div className="status-note" role="status" aria-live="polite">Opening Comfort Check...</div>
      </main>
    );
  }

  if (error && !data) {
    // The check itself could not be opened, so we deliberately do NOT offer a
    // "Delete my response" action here — it would fire a destructive request with
    // stale context. The edit/delete token stays on the device; if the check
    // recovers, the guest can still edit or delete from the working form.
    return (
      <main className="page-shell section-band stack">
        <div className="error-note" role="alert">{error}</div>
        <Link className="btn btn-primary" href="/">
          Create a new Comfort Check
        </Link>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const unavailable = data.check.status !== "active";

  return (
    <main className="page-shell section-band rise">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "flex-start", justifyContent: "center" }}>
        {/* intro column — desktop chrome only; on phones the self-contained form leads
            so the guest answers immediately instead of scrolling past an explainer */}
        <section className="guest-intro" style={{ flex: "1 1 320px", maxWidth: 440, minWidth: 280, paddingTop: 8 }}>
          <div className="eyebrow">✦ private guest link</div>
          <h1 style={{ fontFamily: "var(--type-display)", fontWeight: 800, fontSize: "clamp(2.2rem,4.5vw,3.4rem)", lineHeight: 0.95, letterSpacing: "-0.03em", margin: "16px 0 0" }}>
            This is what <span className="serif serif-lime">people</span> tap.
          </h1>
          <p className="muted" style={{ fontSize: "1.12rem", lineHeight: 1.55, margin: "16px 0 0", maxWidth: "40ch" }}>
            {data.check.draft.privacyCopy}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
            {[
              { n: 1, bg: "var(--sage)", text: "Tap how you feel — yes, maybe, out" },
              { n: 2, bg: "var(--honey)", text: "Flag what matters to you" },
              { n: 3, bg: "var(--clay)", text: "Send — your budget stays yours" }
            ].map((step) => (
              <div key={step.n} style={{ display: "flex", gap: 13, alignItems: "center" }}>
                <span style={{ flex: "0 0 auto", width: 32, height: 32, borderRadius: 10, background: step.bg, color: "var(--bg)", display: "grid", placeItems: "center", fontFamily: "var(--type-display)", fontWeight: 800 }}>
                  {step.n}
                </span>
                <span style={{ fontWeight: 600, color: "var(--muted-2)" }}>{step.text}</span>
              </div>
            ))}
          </div>
          {unavailable ? (
            <div className="error-note" style={{ marginTop: 22 }}>
              This Comfort Check is {data.check.status}. Your answers cannot be changed from this link.
            </div>
          ) : null}
        </section>

        {/* phone frame with the response form */}
        <div style={{ flex: "0 0 auto", width: "min(394px,92vw)" }}>
          <div className="phone-frame">
            <div className="phone-screen">
              <div className="phone-top" />
              <section className="form-panel" aria-label="Guest response form" style={{ background: "transparent", boxShadow: "none", borderRadius: 0, padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--type-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-ink-2)" }}>
                      Comfort Check
                    </span>
                    <span className="verdict-chip tone-green" style={{ fontSize: "0.72rem", padding: "5px 10px" }}>
                      ✦ Private
                    </span>
                  </div>
                  <h2 style={{ fontFamily: "var(--type-display)", fontWeight: 700, fontSize: "1.5rem", lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0 }}>
                    {data.check.title}
                  </h2>
                </div>

                {responseToken && responseLoadFailed ? (
                  <div className="status-note" role="status">
                    We couldn&apos;t reload your previous answer — please review your selections before sending, or your saved
                    response stays as it was.
                  </div>
                ) : null}

                <fieldset className="question-group" disabled={unavailable} style={{ border: "none", padding: 0, background: "transparent" }}>
                  <legend className="legend question-title">{data.check.draft.questions[0]?.prompt || "How do you feel about this plan?"}</legend>
                  {(["in", "maybe", "out"] as const).map((status) => (
                    <label className="choice" key={status}>
                      <input
                        type="radio"
                        name="status"
                        checked={form.status === status}
                        onChange={() => setForm((current) => ({ ...current, status }))}
                      />
                      <span>
                        <strong>{status === "in" ? "I'm in" : status === "maybe" ? "Maybe" : "I'm out"}</strong>
                        <span>
                          {status === "in"
                            ? "This plan feels good."
                            : status === "maybe"
                              ? "This could work with tweaks."
                              : "This does not work for me."}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="question-group" disabled={unavailable} style={{ border: "none", padding: 0, background: "transparent" }}>
                  <legend className="legend question-title">{data.check.draft.questions[1]?.prompt || "What comfort level fits best?"}</legend>
                  {data.check.draft.tiers.map((tier) => (
                    <label className="choice" key={tier.id}>
                      <input
                        type="radio"
                        name="tier"
                        checked={form.tierId === tier.id}
                        onChange={() => setForm((current) => ({ ...current, tierId: tier.id }))}
                      />
                      <span>
                        <strong>{tier.label}</strong>
                        <span>{tier.description}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="question-group" disabled={unavailable} style={{ border: "none", padding: 0, background: "transparent" }}>
                  <legend className="legend question-title">{data.check.draft.questions[2]?.prompt || "Anything that would make this easier?"}</legend>
                  <div style={{ fontSize: "0.82rem", color: "var(--muted-ink-2)", marginBottom: 4 }}>Tap any that apply — totally optional.</div>
                  {data.check.draft.constraints.map((constraint) => (
                    <label className="choice" key={constraint.id}>
                      <input
                        type="checkbox"
                        checked={form.constraintIds.includes(constraint.id)}
                        onChange={() => toggleConstraint(constraint.id)}
                      />
                      <span>
                        <strong>{constraint.label}</strong>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <div className="field">
                  <label htmlFor="private-note">
                    A private note <span style={{ fontWeight: 500, color: "var(--muted-ink-2)", fontFamily: "var(--type-body)" }}>(only you)</span>
                  </label>
                  <textarea
                    id="private-note"
                    disabled={unavailable}
                    value={form.privateNote}
                    maxLength={500}
                    onChange={(event) => setForm((current) => ({ ...current, privateNote: event.target.value }))}
                    placeholder="Just for you — the host never sees this. Saved with your response so you can recall it when you edit."
                  />
                </div>

                {message ? (
                  <div className="success-note" role="status" aria-live="polite">
                    <Check size={16} aria-hidden /> {message}
                  </div>
                ) : null}
                {error ? <div className="error-note" role="alert">{error}</div> : null}

                <button className="btn btn-secondary btn-block" type="button" onClick={submit} disabled={unavailable || isSaving}>
                  {responseToken ? <Edit3 size={18} aria-hidden /> : null}
                  {responseToken ? "Update response" : "✦ Send privately"}
                </button>
                {responseToken ? (
                  <button className="btn btn-ghost btn-block" type="button" onClick={remove} disabled={isSaving}>
                    <Trash2 size={18} aria-hidden />
                    Delete response
                  </button>
                ) : (
                  <button className="btn btn-ghost btn-block" type="button" onClick={() => setForm(initialResponse)}>
                    <RotateCcw size={18} aria-hidden />
                    Reset
                  </button>
                )}
                <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--muted-ink-2)" }}>No names. No budgets. Editable anytime.</div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
