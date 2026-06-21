"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  type ComfortConstraint,
  type ComfortDraft,
  type ComfortQuestion,
  type ComfortTier,
  type PlanTier,
  THEMES,
  THEME_ICON_NAMES,
  getPlanLimits,
  getTheme,
  themeIconGlyph
} from "@sayable/core";
import {
  ArrowRight,
  Clipboard,
  Crown,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  Trash2
} from "lucide-react";
import { authHeaders } from "./client-utils";
import { copyText, postAnalytics } from "./client-io";
import type { HostReviewEndpoints } from "./host-endpoints";

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
  checkout: {
    canSimulateOutcomes: boolean;
  };
  result: {
    responseCount: number;
    isPrivacySuppressed: boolean;
    bestFit: { label: string; detail: string; tone: string };
  };
}

function safeId(label: string) {
  return `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "constraint"}`;
}

function labelKey(label: string) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

interface HostReviewClientProps {
  endpoints: HostReviewEndpoints;
}

export default function HostReviewClient({ endpoints }: HostReviewClientProps) {
  const [data, setData] = useState<HostData | null>(null);
  const [constraints, setConstraints] = useState<ComfortConstraint[]>([]);
  const [newConstraint, setNewConstraint] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [customAccent, setCustomAccent] = useState("#2f6f5e");
  const [customIcon, setCustomIcon] = useState("sparkle");
  const [questions, setQuestions] = useState<ComfortQuestion[]>([]);
  const [tiers, setTiers] = useState<ComfortTier[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invalidFieldId, setInvalidFieldId] = useState("");

  const theme = useMemo(() => getTheme(data?.check.themeId), [data?.check.themeId]);
  const limits = data ? getPlanLimits(data.check.plan) : getPlanLimits("free");

  const requestHeaders = useCallback(
    async (headers: Record<string, string> = {}) => ({
      ...headers,
      ...(endpoints.requiresAuth ? await authHeaders() : {})
    }),
    [endpoints.requiresAuth]
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(endpoints.apiPath, { cache: "no-store", headers: await requestHeaders() });
      const payload = (await response.json()) as HostData & { error?: string };
      if (!response.ok) {
        setError(payload.error || "Host link could not be opened.");
        return;
      }
      setData(payload);
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
  }, [endpoints.apiPath, requestHeaders]);

  useEffect(() => {
    // Direct call; the old setTimeout(0)+clearTimeout idiom was cancelled by React 19
    // Strict Mode in dev, leaving the page stuck on "Opening host link...".
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Actions on this screen are spread across the page; bring the save/share
  // feedback into view when it changes so it isn't missed far below the fold.
  useEffect(() => {
    if (message || error) {
      const reduce =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      feedbackRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  }, [message, error]);

  async function patch(body: unknown, success: string) {
    setIsSaving(true);
    setError("");
    setMessage("");
    setInvalidFieldId("");
    try {
      const response = await fetch(endpoints.apiPath, {
        method: "PATCH",
        headers: await requestHeaders({ "Content-Type": "application/json" }),
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
    if (!endpoints.claimPath) {
      setError("This dashboard check is already saved to your account.");
      return false;
    }
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch(endpoints.claimPath, {
        method: "POST",
        headers
      });
      const payload = (await response.json()) as { check?: HostCheck; error?: string };
      if (!response.ok || !payload.check) {
        setError(payload.error || "Could not save this Comfort Check.");
        return false;
      }
      setData((current) => (current ? { ...current, check: payload.check! } : current));
      setMessage("Saved to your host dashboard.");
      return true;
    } catch {
      setError("Network connection dropped while saving. Try again.");
      return false;
    }
  }

  async function upgrade(outcome: "success" | "failed" | "cancelled" = "success") {
    const signedIn = endpoints.requiresAuth || Boolean(data?.check.ownerUserId) || (await claim());
    if (!signedIn) {
      return;
    }
    setError("");
    try {
      const response = await fetch(endpoints.upgradePath, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ outcome })
      });
      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok) {
        setError(payload.error || "Mock checkout did not complete.");
        return;
      }
      if (payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl);
        return;
      }
      setMessage(outcome === "success" ? "Premium Check unlocked." : `Checkout ${outcome}.`);
      await load();
    } catch {
      setError("Network connection dropped during checkout. Try again; duplicate upgrades stay blocked.");
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
    const id = safeId(label);
    const duplicate = constraints.some(
      (constraint) =>
        constraint.id === id ||
        ((constraint.isCustom || constraint.group === "custom") && labelKey(constraint.label) === labelKey(label))
    );
    if (duplicate) {
      setInvalidFieldId("new-constraint");
      setMessage("");
      setError("Custom constraints need unique labels.");
      return;
    }
    setConstraints((items) => [...items, { id, label, group: "custom", isCustom: true }]);
    setNewConstraint("");
  }

  if (error && !data) {
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
    return (
      <main className="page-shell section-band">
        <div className="status-note" role="status" aria-live="polite">Opening host link...</div>
      </main>
    );
  }

  const accent = data.check.customTheme?.accent || theme.accent;
  const hostErrorId = error ? "host-review-error" : undefined;
  const fieldErrorProps = (id: string) => ({
    "aria-invalid": invalidFieldId === id,
    "aria-describedby": invalidFieldId === id ? hostErrorId : undefined
  });

  return (
    <main className="page-shell section-band rise">
      <div className="eyebrow">{data.check.plan === "premium" ? "✦ Premium Check" : "✦ Free Comfort Check"}</div>
      <h1
        style={{
          fontFamily: "var(--type-display)",
          fontWeight: 800,
          fontSize: "clamp(2.4rem,5.5vw,4.2rem)",
          lineHeight: 0.92,
          letterSpacing: "-0.035em",
          overflowWrap: "anywhere",
          margin: "14px 0 0"
        }}
      >
        {data.check.title} <span className="serif serif-lime">is ready</span>
      </h1>
      <p className="muted" style={{ fontSize: "1.12rem", margin: "14px 0 0", maxWidth: "54ch" }}>
        {data.check.draft.resultIntro}
      </p>
      <div className="status-note" style={{ margin: "20px 0 0", maxWidth: "60ch" }}>
        ✦ Ready to share. Sayable already drafted the guest link, privacy copy, and result rules; editing is optional.
      </div>

      <div className="grid-two review-grid" style={{ marginTop: 30, alignItems: "start" }}>
        <section className="stack">
          <div className="eyebrow" style={{ marginBottom: 2 }}>✦ optional fine-tuning</div>
          <details className="tool-panel stack">
            <summary>
              <span className="summary-copy">
                <span>Fine-tune questions</span>
                <span className="summary-hint">{questions.length} prompts generated. Open to adjust wording.</span>
              </span>
            </summary>
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
            <button className="btn btn-secondary" type="button" onClick={saveDraftItems} disabled={isSaving}>
              <Save size={18} aria-hidden />
              Save questions and tiers
            </button>
          </details>

          <details className="tool-panel stack">
            <summary>
              <span className="summary-copy">
                <span>Fine-tune comfort tiers</span>
                <span className="summary-hint">{tiers.length} answer tiers. Open to rename options.</span>
              </span>
            </summary>
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

        <aside className="stack" style={{ position: "sticky", top: 24 }}>
          <div
            style={{
              fontFamily: "var(--type-mono)",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "#8e8675"
            }}
          >
            What lands in the chat
          </div>
          <div
            className="share-card"
            style={{ transform: "rotate(2deg)", "--theme-accent": accent } as CSSProperties}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span
                className="theme-icon-badge"
                aria-hidden
                style={{ margin: 0, background: "var(--theme-accent)", borderColor: "transparent", color: "#fff" }}
              >
                {/* monochrome ✦ to match the public /r/ snapshot this previews */}
                ✦
              </span>
              <span className="verdict-chip tone-green" style={{ fontSize: "0.74rem", padding: "5px 11px" }}>
                ✦ Private
              </span>
            </div>
            <div className="chat-bubble">
              <div className="title">{data.check.title}</div>
              <div style={{ fontSize: "0.88rem", color: "var(--muted-ink)", lineHeight: 1.45 }}>
                {data.check.draft.shareText}
              </div>
              <div className="chat-url">✦ Comfort Check — private answers, group-safe result</div>
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

          <div className="tool-panel stack">
            <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Share</h2>
            <p className="muted">Host links stay private. Share this guest link anywhere.</p>
            <div className="button-row">
              <button className="btn btn-primary" type="button" onClick={shareGuestLink}>
                <Share2 size={18} aria-hidden />
                Share in Messages
              </button>
              <button className="btn btn-secondary" type="button" onClick={copyGuestLink}>
                <Clipboard size={18} aria-hidden />
                Copy link
              </button>
              <Link className="btn btn-ghost" href={endpoints.resultsPath}>
                Results
                <ArrowRight size={18} aria-hidden />
              </Link>
            </div>
            <div className="danger-zone">
              <button className="btn btn-ghost-danger" type="button" onClick={deleteCheck} disabled={isSaving}>
                <Trash2 size={16} aria-hidden />
                {confirmDelete ? "Confirm delete" : "Delete check"}
              </button>
            </div>
          </div>

          <div className="tool-panel stack">
            <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Save</h2>
            {data.check.ownerUserId ? (
              <div className="success-note" role="status">
                ✦ Saved to your host dashboard.
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
        <summary>
          <span className="summary-copy">
            <span>Edit generated constraints</span>
            <span className="summary-hint">{constraints.length} guest blockers. Open to add, rename, or remove.</span>
          </span>
        </summary>
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
          <div className="eyebrow">✦ pick a look</div>
          <h2>
            Choose a <span className="serif serif-lime">theme</span>
          </h2>
          <p className="muted">The selected theme styles your host result accent and the shareable link preview imagery. The guest answer link and public snapshot keep Sayable&apos;s clean, focused layout.</p>
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
              <select
                id="custom-icon"
                value={customIcon}
                {...fieldErrorProps("custom-icon")}
                onChange={(event) => setCustomIcon(event.target.value)}
              >
                {THEME_ICON_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {`${themeIconGlyph(name)}  ${name}`}
                  </option>
                ))}
              </select>
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
          <h3>Premium Check</h3>
          <p className="muted">
            Unlock 100 responses, 10 custom constraints, 180-day retention, premium themes, custom color/icon, and export-ready
            summaries.
          </p>
          {data.check.plan === "premium" ? (
            <div className="success-note" role="status">
              ✦ Premium is unlocked for this Comfort Check.
            </div>
          ) : (
            <div className="button-row">
              <button className="btn btn-primary" type="button" onClick={() => upgrade("success")}>
                <Crown size={18} aria-hidden />
                Unlock Premium
              </button>
              {data.checkout.canSimulateOutcomes ? (
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
              ) : null}
            </div>
          )}
        </div>
        <div className="result-panel stack">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span
              style={{
                fontFamily: "var(--type-mono)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--muted-ink-2)"
              }}
            >
              Current signal
            </span>
            <span className={`verdict-chip tone-${data.result.bestFit.tone}`} style={{ fontSize: "0.85rem", padding: "6px 12px" }}>
              {data.result.bestFit.label}
            </span>
          </div>
          <p className="muted">{data.result.responseCount} responses</p>
          <span className="muted">{data.result.bestFit.detail}</span>
          <Link className="btn btn-secondary" href={endpoints.resultsPath}>
            View host results
            <RefreshCw size={18} aria-hidden />
          </Link>
        </div>
      </section>

      <div ref={feedbackRef}>
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
      </div>
    </main>
  );
}
