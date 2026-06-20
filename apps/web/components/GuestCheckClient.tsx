"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { type ComfortDraft, type PlanTier, type ResponseStatus, getTheme } from "@sayable/core";
import { Check, Edit3, Lock, RotateCcw, Trash2 } from "lucide-react";

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

export default function GuestCheckClient({ guestToken }: { guestToken: string }) {
  const [data, setData] = useState<PublicCheckData | null>(null);
  const [form, setForm] = useState<GuestResponseState>(initialResponse);
  const [responseToken, setResponseToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const storageKey = `sayable_response_${guestToken}`;
  const nonceKey = `sayable_guest_nonce_${guestToken}`;
  const theme = useMemo(() => getTheme(data?.check.themeId), [data?.check.themeId]);

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
            return;
          }
          setError("Could not load your saved response. Your edit/delete token is still kept on this device.");
          return;
        }
        const payload = (await response.json()) as GuestResponseState;
        setForm({
          status: payload.status,
          tierId: payload.tierId,
          constraintIds: payload.constraintIds,
          privateNote: payload.privateNote || ""
        });
      } catch {
        setError("Network connection dropped while loading your saved response. Your edit/delete token is still kept on this device.");
      }
    },
    [storageKey]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      setResponseToken(stored);
      await loadResponse(stored);
    }
    try {
      const response = await fetch(`/api/checks/guest/${guestToken}`, { cache: "no-store" });
      const payload = (await response.json()) as PublicCheckData & { error?: string };
      if (!response.ok) {
        setError(payload.error || "This Comfort Check could not be opened.");
        setIsLoading(false);
        return;
      }
      setData(payload);
      setIsLoading(false);
    } catch {
      setError("Network connection dropped while opening this Comfort Check. Try again.");
      setIsLoading(false);
    }
  }, [guestToken, loadResponse, storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
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
    return (
      <main className="page-shell section-band stack">
        <div className="error-note" role="alert">{error}</div>
        {message ? (
          <div className="success-note" role="status" aria-live="polite">
            <Check size={16} aria-hidden /> {message}
          </div>
        ) : null}
        {responseToken ? (
          <button className="btn btn-danger" type="button" onClick={remove} disabled={isSaving}>
            <Trash2 size={18} aria-hidden />
            Delete my response
          </button>
        ) : null}
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
  const accent = data.check.customTheme?.accent || theme.accent;

  return (
    <main
      className="page-shell section-band"
      style={
        {
          "--accent": accent,
          "--soft": theme.soft,
          "--paper": theme.paper,
          "--ink": theme.ink
        } as CSSProperties
      }
    >
      <div className="grid-two guest-response-grid">
        <section className="stack">
          <span className="pill">
            <Lock size={15} aria-hidden />
            Private guest link
          </span>
          <h1 className="compact-title">{data.check.title}</h1>
          <p className="muted">{data.check.draft.privacyCopy}</p>
          <div className="status-note">
            Guests do not need accounts. The host gets grouped patterns after enough responses, not named budget answers
            or private notes.
          </div>
          {unavailable ? (
            <div className="error-note">
              This Comfort Check is {data.check.status}. Your answers cannot be changed from this link.
            </div>
          ) : null}
        </section>

        <section className="form-panel stack" aria-label="Guest response form">
          <fieldset className="question-group" disabled={unavailable}>
            <legend className="legend question-title">{data.check.draft.questions[0]?.prompt}</legend>
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

          <fieldset className="question-group" disabled={unavailable}>
            <legend className="legend question-title">{data.check.draft.questions[1]?.prompt}</legend>
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

          <fieldset className="question-group" disabled={unavailable}>
            <legend className="legend question-title">{data.check.draft.questions[2]?.prompt}</legend>
            {data.check.draft.constraints.map((constraint) => (
              <label className="choice" key={constraint.id}>
                <input
                  type="checkbox"
                  checked={form.constraintIds.includes(constraint.id)}
                  onChange={() => toggleConstraint(constraint.id)}
                />
                <span>
                  <strong>{constraint.label}</strong>
                  <span>{constraint.group}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor="private-note">Private note</label>
            <textarea
              id="private-note"
              disabled={unavailable}
              value={form.privateNote}
              maxLength={500}
              onChange={(event) => setForm((current) => ({ ...current, privateNote: event.target.value }))}
              placeholder="Optional. Only used as private context for the host, never in public snapshots."
            />
          </div>

          {message ? (
            <div className="success-note" role="status" aria-live="polite">
              <Check size={16} aria-hidden /> {message}
            </div>
          ) : null}
          {error ? <div className="error-note" role="alert">{error}</div> : null}
          <div className="button-row">
            <button className="btn btn-primary" type="button" onClick={submit} disabled={unavailable || isSaving}>
              {responseToken ? <Edit3 size={18} aria-hidden /> : <Check size={18} aria-hidden />}
              {responseToken ? "Update response" : "Submit privately"}
            </button>
            {responseToken ? (
              <button className="btn btn-danger" type="button" onClick={remove} disabled={isSaving}>
                <Trash2 size={18} aria-hidden />
                Delete response
              </button>
            ) : (
              <button className="btn btn-ghost" type="button" onClick={() => setForm(initialResponse)}>
                <RotateCcw size={18} aria-hidden />
                Reset
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
