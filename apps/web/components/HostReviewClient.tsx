"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  type ComfortConstraint,
  type ComfortDraft,
  type ComfortQuestion,
  type ComfortTier,
  type PlanTier,
  THEMES,
  getPlanLimits,
  getTheme
} from "@sayable/core";
import {
  ArrowRight,
  Clipboard,
  Crown,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  Trash2
} from "lucide-react";
import { authHeaders, copyText, postAnalytics } from "./client-utils";

interface HostCheck {
  id: string;
  title: string;
  plan: PlanTier;
  status: "active" | "closed" | "deleted" | "expired";
  draft: ComfortDraft;
  themeId: string;
  customTheme?: { accent: string; icon: string };
  ownerUserId?: string;
}

interface HostData {
  check: HostCheck;
  guestUrl: string;
  result: {
    responseCount: number;
    isPrivacySuppressed: boolean;
    bestFit: { label: string; detail: string; tone: string };
  };
}

function safeId(label: string) {
  return `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "constraint"}`;
}

function rememberDashboardHostToken(checkId: string, hostToken: string) {
  const mapKey = "sayable_host_token_by_check_id";
  const map = JSON.parse(window.localStorage.getItem(mapKey) || "{}") as Record<string, string>;
  window.localStorage.setItem(mapKey, JSON.stringify({ ...map, [checkId]: hostToken }));
}

export default function HostReviewClient({ hostToken }: { hostToken: string }) {
  const [data, setData] = useState<HostData | null>(null);
  const [constraints, setConstraints] = useState<ComfortConstraint[]>([]);
  const [newConstraint, setNewConstraint] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [customAccent, setCustomAccent] = useState("#2f6f5e");
  const [customIcon, setCustomIcon] = useState("sparkle");
  const [questions, setQuestions] = useState<ComfortQuestion[]>([]);
  const [tiers, setTiers] = useState<ComfortTier[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invalidFieldId, setInvalidFieldId] = useState("");

  const theme = useMemo(() => getTheme(data?.check.themeId), [data?.check.themeId]);
  const limits = data ? getPlanLimits(data.check.plan) : getPlanLimits("free");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/checks/host/${hostToken}`, { cache: "no-store" });
      const payload = (await response.json()) as HostData & { error?: string };
      if (!response.ok) {
        setError(payload.error || "Host link could not be opened.");
        return;
      }
      setData(payload);
      rememberDashboardHostToken(payload.check.id, hostToken);
      setConstraints(payload.check.draft.constraints);
      setQuestions(payload.check.draft.questions);
      setTiers(payload.check.draft.tiers);
      if (payload.check.customTheme) {
        setCustomAccent(payload.check.customTheme.accent);
        setCustomIcon(payload.check.customTheme.icon);
      } else {
        const selectedTheme = getTheme(payload.check.themeId);
        setCustomAccent(selectedTheme.accent);
        setCustomIcon(selectedTheme.icon);
      }
    } catch {
      setError("Network connection dropped while opening this host link. Try again.");
    }
  }, [hostToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function patch(body: unknown, success: string) {
    setIsSaving(true);
    setError("");
    setMessage("");
    setInvalidFieldId("");
    try {
      const response = await fetch(`/api/checks/host/${hostToken}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as { check?: HostCheck; error?: string };
      if (!response.ok || !payload.check) {
        throw new Error(payload.error || "Could not save changes.");
      }
      setData((current) => (current ? { ...current, check: payload.check! } : current));
      setConstraints(payload.check.draft.constraints);
      setQuestions(payload.check.draft.questions);
      setTiers(payload.check.draft.tiers);
      setConfirmDelete(false);
      setInvalidFieldId("");
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveConstraints() {
    const invalid = constraints.find((constraint) => !constraint.label.trim());
    if (invalid) {
      setInvalidFieldId(`constraint-${invalid.id}`);
      setMessage("");
      setError("Constraint labels cannot be empty.");
      return;
    }
    await patch({ constraints }, "Generated items saved.");
  }

  async function saveDraftItems() {
    for (const [index, question] of questions.entries()) {
      if (!question.prompt.trim()) {
        setInvalidFieldId(`question-prompt-${question.id}`);
        setMessage("");
        setError(`Question ${index + 1} cannot be empty.`);
        return;
      }
      if (!question.helper.trim()) {
        setInvalidFieldId(`question-helper-${question.id}`);
        setMessage("");
        setError(`Question ${index + 1} helper cannot be empty.`);
        return;
      }
    }
    for (const [index, tier] of tiers.entries()) {
      if (!tier.label.trim()) {
        setInvalidFieldId(`tier-label-${tier.id}`);
        setMessage("");
        setError(`Tier ${index + 1} label cannot be empty.`);
        return;
      }
      if (!tier.description.trim()) {
        setInvalidFieldId(`tier-description-${tier.id}`);
        setMessage("");
        setError(`Tier ${index + 1} description cannot be empty.`);
        return;
      }
    }
    await patch({ questions, tiers }, "Generated questions and tiers saved.");
  }

  async function resetDraft() {
    await patch({ resetDraft: true }, "Draft reset to Sayable defaults.");
  }

  async function deleteCheck() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setMessage("Press Delete check again to permanently close guest access and anonymize stored responses.");
      return;
    }
    await patch({ status: "deleted" }, "Comfort Check deleted. Guest links and stored response details are no longer available.");
  }

  async function chooseTheme(themeId: string) {
    const selectedTheme = getTheme(themeId);
    setCustomAccent(selectedTheme.accent);
    setCustomIcon(selectedTheme.icon);
    await patch({ themeId, resetCustomTheme: true }, "Theme saved.");
  }

  async function resetTheme() {
    const themeId = data?.check.themeId || "sayable_default";
    const selectedTheme = getTheme(themeId);
    setCustomAccent(selectedTheme.accent);
    setCustomIcon(selectedTheme.icon);
    await patch({ themeId, resetCustomTheme: true }, "Theme reset to selected template defaults.");
  }

  async function saveCustomTheme() {
    if (!/^#[0-9a-fA-F]{6}$/.test(customAccent)) {
      setInvalidFieldId("custom-accent");
      setMessage("");
      setError("Choose a valid custom color.");
      return;
    }
    if (!/^[a-z0-9_-]{1,16}$/i.test(customIcon)) {
      setInvalidFieldId("custom-icon");
      setMessage("");
      setError("Choose a valid custom icon name.");
      return;
    }
    await patch({ customTheme: { accent: customAccent, icon: customIcon } }, "Custom Premium styling saved.");
  }

  async function shareGuestLink() {
    if (!data) {
      return;
    }
    setError("");
    setMessage("");
    const shareText = `${data.check.draft.shareText} ${data.guestUrl}`;
    await postAnalytics("share_sheet_opened", { surface: "host_review" });
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: data.check.title, text: data.check.draft.shareText, url: data.guestUrl });
          setMessage("Share sheet opened.");
          return;
        } catch {
          // Fall through to copy when the browser rejects or the user cancels native share.
        }
      }
      await copyText(shareText);
      await postAnalytics("link_copied", { surface: "host_review" });
      setMessage("Guest link copied.");
    } catch {
      setError(`Could not open share options. Copy this guest link: ${data.guestUrl}`);
    }
  }

  async function copyGuestLink() {
    if (!data) {
      return;
    }
    setError("");
    setMessage("");
    await postAnalytics("link_copied", { surface: "host_review" });
    try {
      await copyText(`${data.check.draft.shareText} ${data.guestUrl}`);
      setMessage("Guest link copied.");
    } catch {
      setError(`Clipboard is unavailable. Copy this guest link: ${data.guestUrl}`);
    }
  }

  async function claim() {
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/checks/host/${hostToken}/claim`, {
        method: "POST",
        headers
      });
      const payload = (await response.json()) as { check?: HostCheck; error?: string };
      if (!response.ok || !payload.check) {
        setError(payload.error || "Could not save this Comfort Check.");
        return false;
      }
      setData((current) => (current ? { ...current, check: payload.check! } : current));
      setMessage("Saved to your demo Google dashboard.");
      return true;
    } catch {
      setError("Network connection dropped while saving. Try again.");
      return false;
    }
  }

  async function upgrade(outcome: "success" | "failed" | "cancelled" = "success") {
    const signedIn = data?.check.ownerUserId || (await claim());
    if (!signedIn) {
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/checks/host/${hostToken}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ outcome })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Mock checkout did not complete.");
        return;
      }
      setMessage(outcome === "success" ? "Premium Check unlocked." : `Mock checkout ${outcome}.`);
      await load();
    } catch {
      setError("Network connection dropped during mock checkout. Try again; duplicate upgrades stay blocked.");
    }
  }

  function addConstraint() {
    const label = newConstraint.trim();
    if (!label || !data) {
      setInvalidFieldId("new-constraint");
      setMessage("");
      setError("Enter a custom constraint before adding it.");
      return;
    }
    const customCount = constraints.filter((constraint) => constraint.isCustom).length;
    if (customCount >= limits.maxCustomConstraints) {
      setMessage("");
      setError(`${data.check.plan} checks allow ${limits.maxCustomConstraints} custom constraints.`);
      return;
    }
    setConstraints((items) => [...items, { id: safeId(label), label, group: "custom", isCustom: true }]);
    setNewConstraint("");
  }

  if (error && !data) {
    return (
      <main className="page-shell section-band">
        <div className="error-note" role="alert">{error}</div>
        <Link className="btn btn-primary" href="/">
          Create a new Comfort Check
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page-shell section-band">
        <div className="status-note" role="status" aria-live="polite">Opening host link...</div>
      </main>
    );
  }

  const accent = data.check.customTheme?.accent || theme.accent;
  const themeIcon = data.check.customTheme?.icon || theme.icon;
  const hostErrorId = error ? "host-review-error" : undefined;
  const fieldErrorProps = (id: string) => ({
    "aria-invalid": invalidFieldId === id,
    "aria-describedby": invalidFieldId === id ? hostErrorId : undefined
  });

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
      <div className="grid-two review-grid">
        <section className="stack">
          <span className="pill">{data.check.plan === "premium" ? "Premium Check" : "Free Comfort Check"}</span>
          <h1 className="compact-title">{data.check.title}</h1>
          <p className="muted">{data.check.draft.resultIntro}</p>
          <div className="status-note">
            Ready to share. Sayable already drafted the guest link, privacy copy, and result rules; editing is optional.
          </div>

          <details className="tool-panel stack">
            <summary>Fine-tune questions</summary>
            {questions.map((question, index) => (
              <div className="stack status-note" key={question.id}>
                <div className="field">
                  <label htmlFor={`question-prompt-${question.id}`}>Question {index + 1}</label>
                  <input
                    id={`question-prompt-${question.id}`}
                    value={question.prompt}
                    {...fieldErrorProps(`question-prompt-${question.id}`)}
                    onChange={(event) =>
                      setQuestions((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, prompt: event.target.value.slice(0, 140) } : item
                        )
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`question-helper-${question.id}`}>Helper</label>
                  <input
                    id={`question-helper-${question.id}`}
                    value={question.helper}
                    {...fieldErrorProps(`question-helper-${question.id}`)}
                    onChange={(event) =>
                      setQuestions((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, helper: event.target.value.slice(0, 220) } : item
                        )
                      )
                    }
                  />
                </div>
                {questions.length > 1 ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setQuestions((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Delete question
                  </button>
                ) : null}
              </div>
            ))}
          </details>

          <details className="tool-panel stack">
            <summary>Fine-tune comfort tiers</summary>
            {tiers.map((tier, index) => (
              <div className="stack choice" key={tier.id}>
                <span className="pill">{tier.score}</span>
                <div className="field">
                  <label htmlFor={`tier-label-${tier.id}`}>Tier {index + 1}</label>
                  <input
                    id={`tier-label-${tier.id}`}
                    value={tier.label}
                    {...fieldErrorProps(`tier-label-${tier.id}`)}
                    onChange={(event) =>
                      setTiers((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value.slice(0, 80) } : item
                        )
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`tier-description-${tier.id}`}>Description</label>
                  <input
                    id={`tier-description-${tier.id}`}
                    value={tier.description}
                    {...fieldErrorProps(`tier-description-${tier.id}`)}
                    onChange={(event) =>
                      setTiers((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description: event.target.value.slice(0, 180) } : item
                        )
                      )
                    }
                  />
                </div>
                {tiers.length > 2 ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setTiers((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Delete tier
                  </button>
                ) : null}
              </div>
            ))}
            <button className="btn btn-secondary" type="button" onClick={saveDraftItems} disabled={isSaving}>
              <Save size={18} aria-hidden />
              Save questions and tiers
            </button>
          </details>
        </section>

        <aside className="stack">
          <div className="message-preview">
            <div className="preview-art">
              <div className="theme-icon-badge" aria-hidden>
                {themeIcon}
              </div>
              <span className="pill">Link preview</span>
              <h2>{data.check.title}</h2>
              <p>Comfort Check - private answers, group-safe result.</p>
            </div>
            <div className="preview-card">
              <strong>{data.check.draft.activityLabel}</strong>
              <span className="muted">{data.check.draft.shareText}</span>
            </div>
          </div>

          <div className="tool-panel stack">
            <h2>Share</h2>
            <p className="muted">Host links stay private. Share this guest link anywhere.</p>
            <div className="button-row">
              <button className="btn btn-primary" type="button" onClick={shareGuestLink}>
                <MessageCircle size={18} aria-hidden />
                Share in Messages
              </button>
              <button className="btn btn-secondary" type="button" onClick={copyGuestLink}>
                <Clipboard size={18} aria-hidden />
                Copy link
              </button>
              <Link className="btn btn-ghost" href={`/h/${hostToken}`}>
                Results
                <ArrowRight size={18} aria-hidden />
              </Link>
              <button className="btn btn-danger" type="button" onClick={deleteCheck} disabled={isSaving}>
                <Trash2 size={18} aria-hidden />
                {confirmDelete ? "Confirm delete" : "Delete check"}
              </button>
            </div>
          </div>

          <div className="tool-panel stack">
            <h2>Save</h2>
            {data.check.ownerUserId ? (
              <div className="success-note" role="status">
                Saved to your host dashboard.
              </div>
            ) : (
              <>
                <p className="muted">Save this check to your host dashboard before upgrading or managing it later.</p>
                <button className="btn btn-secondary" type="button" onClick={claim}>
                  <Save size={18} aria-hidden />
                  Continue with Google
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <details className="section-band stack">
        <summary>Edit generated constraints</summary>
        <div className="section-heading">
          <p>Free checks allow {getPlanLimits("free").maxCustomConstraints} custom constraints. Premium allows 10.</p>
        </div>
        <div className="option-list">
          {constraints.map((constraint, index) => (
            <div className="constraint-row" key={constraint.id}>
              <span className="constraint-enabled-dot" aria-hidden />
              <input
                value={constraint.label}
                id={`constraint-${constraint.id}`}
                aria-label={`Constraint ${index + 1}`}
                {...fieldErrorProps(`constraint-${constraint.id}`)}
                onChange={(event) =>
                  setConstraints((items) =>
                    items.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, label: event.target.value.slice(0, 100) } : item
                    )
                  )
                }
              />
              <button
                className="btn btn-ghost"
                type="button"
                aria-label={`Delete ${constraint.label}`}
                onClick={() => setConstraints((items) => items.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 size={17} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <div className="grid-two">
          <div className="field">
            <label htmlFor="new-constraint">Custom constraint</label>
            <input
              id="new-constraint"
              value={newConstraint}
              maxLength={80}
              {...fieldErrorProps("new-constraint")}
              onChange={(event) => setNewConstraint(event.target.value)}
              placeholder="Needs a vegetarian option"
            />
          </div>
          <div className="button-row">
            <button className="btn btn-secondary" type="button" onClick={addConstraint}>
              <Plus size={18} aria-hidden />
              Add
            </button>
            <button className="btn btn-primary" type="button" onClick={saveConstraints} disabled={isSaving}>
              <Save size={18} aria-hidden />
              Save edits
            </button>
            <button className="btn btn-ghost" type="button" onClick={resetDraft}>
              <RotateCcw size={18} aria-hidden />
              Reset draft
            </button>
          </div>
        </div>
      </details>

      <section className="section-band stack">
        <div className="section-heading">
          <h2>Theme preview</h2>
          <p>The selected theme carries across guest link, host result, snapshot, and preview imagery.</p>
        </div>
        <div className="theme-grid">
          {THEMES.map((item) => {
            const locked = item.premium && data.check.plan !== "premium";
            return (
              <button
                className="theme-choice"
                type="button"
                key={item.id}
                style={
                  {
                    "--theme-accent": item.accent,
                    "--theme-paper": item.paper
                  } as CSSProperties
                }
                onClick={() => (locked ? setError("Upgrade to Premium Check to use that theme.") : chooseTheme(item.id))}
                aria-pressed={data.check.themeId === item.id}
              >
                <span className="theme-corner-icon" aria-hidden>
                  {item.icon}
                </span>
                <div className="theme-swatch" aria-hidden>
                  <span style={{ background: item.accent }} />
                  <span style={{ background: item.soft }} />
                  <span style={{ background: item.paper }} />
                </div>
                <strong>{item.name}</strong>
                <span className="muted">{item.description}</span>
                {locked ? <span className="premium-lock">Premium</span> : null}
              </button>
            );
          })}
        </div>
        {data.check.plan === "premium" ? (
          <div className="grid-two">
            <div className="field">
              <label htmlFor="custom-accent">Custom color</label>
              <input
                id="custom-accent"
                type="color"
                value={customAccent}
                {...fieldErrorProps("custom-accent")}
                onChange={(event) => setCustomAccent(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="custom-icon">Custom icon</label>
              <input
                id="custom-icon"
                value={customIcon}
                maxLength={16}
                {...fieldErrorProps("custom-icon")}
                onChange={(event) => setCustomIcon(event.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={saveCustomTheme}>
              Save custom theme
            </button>
            <button className="btn btn-secondary" type="button" onClick={resetTheme}>
              Reset theme
            </button>
          </div>
        ) : null}
      </section>

      <section className="section-band grid-two">
        <div className="tool-panel stack">
          <span className="pill">
            <Crown size={15} aria-hidden />
            $4.99 one-time
          </span>
          <h2>Premium Check</h2>
          <p className="muted">
            Unlock 100 responses, 10 custom constraints, 180-day retention, premium themes, custom color/icon, and export-ready
            summaries.
          </p>
          {data.check.plan === "premium" ? (
            <div className="success-note" role="status">
              Premium is unlocked for this Comfort Check.
            </div>
          ) : (
            <div className="button-row">
              <button className="btn btn-primary" type="button" onClick={() => upgrade("success")}>
                <Crown size={18} aria-hidden />
                Unlock Premium
              </button>
              <details className="checkout-test-controls">
                <summary>Checkout test states</summary>
                <div className="button-row">
                  <button className="btn btn-ghost" type="button" onClick={() => upgrade("cancelled")}>
                    Test cancelled checkout
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => upgrade("failed")}>
                    Test declined checkout
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
        <div className="result-panel stack">
          <h2>Current signal</h2>
          <p className="muted">{data.result.responseCount} responses</p>
          <strong>{data.result.bestFit.label}</strong>
          <span className="muted">{data.result.bestFit.detail}</span>
          <Link className="btn btn-secondary" href={`/h/${hostToken}`}>
            View host results
            <RefreshCw size={18} aria-hidden />
          </Link>
        </div>
      </section>

      {message ? (
        <div className="success-note" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="error-note" id="host-review-error" role="alert">
          {error}
        </div>
      ) : null}
    </main>
  );
}
