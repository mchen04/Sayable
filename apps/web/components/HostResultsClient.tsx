"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { getTheme, type ComfortDraft, type PlanTier } from "@sayable/core";
import { Check, Clipboard, MessageCircle, RefreshCw, Share2 } from "lucide-react";
import { authHeaders } from "./client-utils";
import { copyText } from "./client-io";
import type { HostResultsEndpoints } from "./host-endpoints";

let realtimeClient: SupabaseClient | null | undefined;

export interface HostResultData {
  check: {
    id: string;
    title: string;
    plan: PlanTier;
    status: string;
    draft: ComfortDraft;
    themeId: string;
    customTheme?: { accent: string; icon: string };
  };
  guestUrl: string;
  responseCount: number;
  deletedResponseCount: number;
  result: {
    responseCount: number;
    privacyThreshold: number;
    isPrivacySuppressed: boolean;
    bestFit: { label: string; detail: string; tone: string };
    comfortRange: { label: string; detail: string };
    currentIdeaWarning?: string;
    groupedConstraints: Array<{ id: string; label: string; signal: string; detail: string; group: string }>;
    finalMessage: string;
    publicSnapshot: { headline: string; detail: string; safeStats: string[] };
  };
}

function getRealtimeClient(): SupabaseClient | null {
  if (realtimeClient !== undefined) {
    return realtimeClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    realtimeClient = null;
    return realtimeClient;
  }
  realtimeClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  return realtimeClient;
}

interface HostResultsClientProps {
  endpoints: HostResultsEndpoints;
  initialData?: HostResultData | null;
}

/* Static style objects hoisted to module scope so they are not re-allocated on
   every 7s poll / realtime broadcast (this component re-renders on each load). */
const RESULTS_TITLE: CSSProperties = {
  fontFamily: "var(--type-display)",
  fontWeight: 800,
  fontSize: "clamp(2.2rem,4.8vw,3.6rem)",
  lineHeight: 0.96,
  letterSpacing: "-0.03em",
  margin: "14px 0 26px"
};
const RESULTS_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))",
  gap: 22,
  alignItems: "start"
};
const VERDICT_CARD: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: "var(--radius-lg)",
  border: "1px solid rgba(198, 242, 78, 0.22)",
  background: "#1C1711",
  color: "var(--ink)",
  padding: "clamp(22px, 3vw, 30px)"
};
const VERDICT_GLOW: CSSProperties = {
  position: "absolute",
  top: -90,
  right: -70,
  width: 220,
  height: 220,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(198,242,78,0.22), transparent 70%)",
  pointerEvents: "none"
};
const VERDICT_H2: CSSProperties = {
  fontFamily: "var(--type-display)",
  fontWeight: 800,
  fontSize: "clamp(1.7rem,3vw,2.4rem)",
  lineHeight: 1.02,
  letterSpacing: "-0.02em",
  margin: "16px 0 0",
  color: "var(--ink)"
};
const MONO_MICRO_LABEL: CSSProperties = {
  fontFamily: "var(--type-mono)",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--muted-ink-2)"
};
const GAUGE_LABELS: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--muted-ink-2)"
};
// Darker than the lime-heavy original so the white micro-label + headline in the
// top-left clear WCAG contrast (the prior #46B377 + 0.32 lime corner was too light).
const SNAPSHOT_GRADIENT =
  "radial-gradient(120% 90% at 12% 8%, rgba(198,242,78,0.10), transparent 55%), linear-gradient(135deg, #2f6f5e, #15120D)";
const RESULTS_EYEBROW_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12
};
const SNAPSHOT_HEADLINE: CSSProperties = {
  fontFamily: "var(--type-display)",
  fontWeight: 800,
  fontSize: "1.7rem",
  letterSpacing: "-0.02em",
  margin: "12px 0 6px",
  color: "#fff"
};

export default function HostResultsClient({ endpoints, initialData = null }: HostResultsClientProps) {
  const [data, setData] = useState<HostResultData | null>(initialData);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generatedFinalMessage, setGeneratedFinalMessage] = useState("");
  const [isLoading, setIsLoading] = useState(!initialData);
  const [syncMode, setSyncMode] = useState<"connecting" | "live" | "refresh">("connecting");
  const theme = useMemo(() => getTheme(data?.check.themeId), [data?.check.themeId]);

  const requestHeaders = useCallback(
    async (headers: Record<string, string> = {}) => ({
      ...headers,
      ...(endpoints.requiresAuth ? await authHeaders() : {})
    }),
    [endpoints.requiresAuth]
  );

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }
      try {
        const response = await fetch(endpoints.apiPath, { cache: "no-store", headers: await requestHeaders() });
        const payload = (await response.json()) as HostResultData & { error?: string };
        if (!response.ok) {
          setError(payload.error || "Host results could not be opened.");
          setIsLoading(false);
          return;
        }
        setData(payload);
        setIsLoading(false);
      } catch {
        setError("Network connection dropped while loading results. Try refresh again.");
        setIsLoading(false);
      }
    },
    [endpoints.apiPath, requestHeaders]
  );

  // Keep a ref to syncMode so the polling interval can read it without resubscribing.
  const syncModeRef = useRef(syncMode);
  useEffect(() => {
    syncModeRef.current = syncMode;
  }, [syncMode]);

  useEffect(() => {
    // Initial load runs directly (the old setTimeout(0)+clearTimeout idiom was
    // cancelled by React 19 Strict Mode in dev). Skip it entirely when the server
    // already seeded initialData — the 7s poll / realtime refresh below keeps it live.
    let cancelled = false;
    if (!initialData) {
      void (async () => {
        await load();
        if (cancelled) return;
      })();
    }
    // The 7s poll is a FALLBACK only: skip it when Supabase realtime is connected
    // ("live", which refreshes on every broadcast) AND when the tab is hidden, so a
    // backgrounded host tab does not keep hitting the server forever.
    const timer = window.setInterval(() => {
      if (syncModeRef.current === "live" || document.hidden) {
        return;
      }
      void load(false);
    }, 7000);
    // Catch up immediately when a backgrounded fallback tab becomes visible again.
    const onVisible = () => {
      if (!document.hidden && syncModeRef.current !== "live") {
        void load(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, initialData]);

  useEffect(() => {
    if (!data?.check.id) {
      return undefined;
    }
    const client = getRealtimeClient();
    if (!client) {
      const refreshTimer = window.setTimeout(() => setSyncMode("refresh"), 0);
      return () => window.clearTimeout(refreshTimer);
    }
    const connectingTimer = window.setTimeout(() => setSyncMode("connecting"), 0);
    let channel: RealtimeChannel | null = client
      .channel(`sayable:check:${data.check.id}`, {
        config: {
          broadcast: { self: false }
        }
      })
      .on("broadcast", { event: "check_changed" }, () => {
        void load(false);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncMode("live");
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setSyncMode("refresh");
        }
      });
    return () => {
      window.clearTimeout(connectingTimer);
      if (channel) {
        void client.removeChannel(channel);
        channel = null;
      }
    };
  }, [data?.check.id, load]);

  async function finalShare() {
    setError("");
    setMessage("");
    let payload: { message?: string; resultUrl?: string; error?: string };
    try {
      const response = await fetch(endpoints.finalSharePath, { method: "POST", headers: await requestHeaders() });
      payload = (await response.json()) as { message?: string; resultUrl?: string; error?: string };
      if (!response.ok || !payload.message) {
        setError(payload.error || "Could not generate final share.");
        return;
      }
    } catch {
      setError("Network connection dropped before the final message was generated. Try again.");
      return;
    }
    setGeneratedFinalMessage(payload.message);
    if (navigator.share && payload.resultUrl) {
      try {
        const shareText = payload.message.replace(payload.resultUrl, "").trim();
        await navigator.share({
          ...(data?.check.title ? { title: data.check.title } : {}),
          text: shareText || payload.message,
          url: payload.resultUrl
        });
        setMessage("Final message opened in share sheet.");
        return;
      } catch {
        // Browsers can reject native share without a trusted user gesture; fall back to copy.
      }
    }
    try {
      await copyText(payload.message);
    } catch {
      setError("Clipboard is unavailable. Copy the final message text from the card above.");
      return;
    }
    setMessage(payload.resultUrl ? "Final message copied with the public result link." : "Final message copied.");
  }

  if (isLoading) {
    return (
      <main className="page-shell section-band">
        <div className="status-note" role="status" aria-live="polite">Loading results...</div>
      </main>
    );
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
    return null;
  }

  const accent = data.check.customTheme?.accent || theme.accent;

  // Presentation-only qualitative fills — the API gives no numeric percentages.
  // Test the more specific "uncomfortable" BEFORE "comfortable" (the latter is a
  // substring of the former, so order matters), and switch on the exact label set.
  const comfortLabel = data.result.comfortRange.label;
  const comfortFill = /uncomfortable/i.test(comfortLabel)
    ? 25
    : /comfortable/i.test(comfortLabel)
      ? 85
      : /workable/i.test(comfortLabel)
        ? 60
        : /mixed/i.test(comfortLabel)
          ? 50
          : 50;
  // Color the comfort label to match its meaning — using the darker tone
  // foregrounds (not raw brand colors) so it clears WCAG AA contrast on cream.
  const comfortColor = /uncomfortable/i.test(comfortLabel)
    ? "var(--tone-clay-fg)"
    : /comfortable/i.test(comfortLabel)
      ? "var(--tone-green-fg)"
      : "var(--tone-amber-fg)";
  // The comfort gauge/heading only makes sense for a real qualitative label;
  // during privacy suppression / 0 responses the core returns sentinel labels.
  const comfortHidden = data.result.isPrivacySuppressed || data.result.responseCount === 0;

  return (
    <main className="page-shell section-band rise">
      <div style={RESULTS_EYEBROW_ROW}>
        <span className="eyebrow">✦ your read · only you see this</span>
        <span
          role="status"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "var(--type-mono)",
            fontSize: "0.74rem",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: syncMode === "live" ? "var(--mint)" : "var(--muted)"
          }}
        >
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: syncMode === "live" ? "var(--sage)" : syncMode === "connecting" ? "var(--honey)" : "var(--muted)"
            }}
          />
          {syncMode === "live" ? "Live · updates as people tap" : syncMode === "connecting" ? "Connecting…" : "Refresh on"}
        </span>
      </div>

      <h1 style={RESULTS_TITLE}>{data.check.title}</h1>

      <div style={RESULTS_GRID}>
        {/* ===== LEFT column ===== */}
        <section className="stack" style={{ gap: 22 }}>
          {/* THE VERDICT — dark surface card */}
          <div style={VERDICT_CARD}>
            <div aria-hidden style={VERDICT_GLOW} />
            <div style={{ position: "relative" }}>
              <span className="eyebrow">the verdict</span>
              {data.result.isPrivacySuppressed ? (
                <>
                  <h2 style={{ ...VERDICT_H2, marginTop: 14 }}>Gathering responses</h2>
                  <div className="status-note" style={{ marginTop: 16 }}>
                    Your group read stays hidden until {data.result.privacyThreshold} people answer — that keeps small groups
                    unidentifiable.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 14 }}>
                    <span className={`verdict-chip tone-${data.result.bestFit.tone}`}>{data.result.bestFit.label}</span>
                  </div>
                  <h2 style={VERDICT_H2}>{data.result.publicSnapshot.headline}</h2>
                  <p style={{ color: "var(--muted-2)", lineHeight: 1.55, margin: "12px 0 0" }}>{data.result.bestFit.detail}</p>
                  <p
                    style={{
                      fontFamily: "var(--type-mono)",
                      fontSize: "0.78rem",
                      letterSpacing: "0.04em",
                      color: "var(--muted)",
                      margin: "18px 0 0"
                    }}
                  >
                    {data.result.responseCount} private responses
                  </p>
                  {data.deletedResponseCount > 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "0.86rem", margin: "8px 0 0" }}>
                      {data.deletedResponseCount} deleted{" "}
                      {data.deletedResponseCount === 1 ? "response is" : "responses are"} ignored in this read.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* COMFORT RANGE — cream card */}
          <div className="card stack">
            <h2 style={{ ...MONO_MICRO_LABEL, margin: 0 }}>Comfort range</h2>
            {comfortHidden ? (
              // Suppressed / no-response: do NOT render a gauge (the sentinel label
              // would otherwise show a fabricated ~50% reading). Show the detail only.
              <div className="status-note">{data.result.comfortRange.detail}</div>
            ) : (
              <>
                <strong style={{ fontFamily: "var(--type-display)", fontSize: "1.6rem", letterSpacing: "-0.02em", color: comfortColor }}>
                  {comfortLabel}
                </strong>
                <div className="gauge" role="presentation">
                  <span style={{ width: `${comfortFill}%` }} />
                </div>
                <div style={GAUGE_LABELS}>
                  <span>Uncomfortable</span>
                  <span>Workable</span>
                  <span>Comfortable</span>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {data.result.comfortRange.detail}
                </p>
              </>
            )}
            {data.result.currentIdeaWarning ? (
              <div className="status-note">{data.result.currentIdeaWarning}</div>
            ) : null}
          </div>
        </section>

        {/* ===== RIGHT column ===== */}
        <aside className="stack" style={{ gap: 22 }}>
          {/* What people quietly want — cream card */}
          <div className="card stack">
            <h2 style={{ ...MONO_MICRO_LABEL, margin: 0 }}>What people quietly want</h2>
            {data.result.groupedConstraints.length ? (
              data.result.groupedConstraints.map((constraint, index) => (
                <div key={constraint.id} className="stack" style={{ gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <strong style={{ color: "var(--ink-dark)" }}>{constraint.label}</strong>
                    <span style={{ fontSize: "0.82rem", color: "var(--muted-ink)", whiteSpace: "nowrap" }}>{constraint.signal}</span>
                  </div>
                  <div className="signal-bar" role="presentation">
                    <span style={{ width: `${Math.max(30, 90 - index * 16)}%` }} />
                  </div>
                  <span style={{ fontSize: "0.85rem", color: "var(--muted-ink)", lineHeight: 1.45 }}>{constraint.detail}</span>
                </div>
              ))
            ) : (
              <div className="status-note">
                {data.result.isPrivacySuppressed
                  ? "Constraint details stay hidden until the privacy threshold is met."
                  : "Nothing stood out across enough people yet."}
              </div>
            )}
          </div>

          {/* PUBLIC-SAFE SNAPSHOT */}
          <div className="snapshot" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={
                {
                  "--theme-accent": accent,
                  padding: "clamp(20px, 3vw, 26px)",
                  color: "#fff",
                  background: SNAPSHOT_GRADIENT
                } as CSSProperties
              }
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span
                  style={{
                    fontFamily: "var(--type-mono)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "#fff"
                  }}
                >
                  public-safe snapshot
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: "var(--radius-pill)",
                    padding: "5px 11px",
                    background: "var(--lime)",
                    color: "var(--bg)",
                    fontFamily: "var(--type-mono)",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    whiteSpace: "nowrap"
                  }}
                >
                  ✦ safe to share
                </span>
              </div>
              <div
                className="theme-icon-badge"
                aria-hidden
                style={{ marginTop: 16, background: "var(--theme-accent)", borderColor: "transparent", color: "var(--bg)" }}
              >
                {/* monochrome ✦ to match the actual /r/ public snapshot it previews */}
                ✦
              </div>
              <h2 style={SNAPSHOT_HEADLINE}>{data.result.publicSnapshot.headline}</h2>
              <p style={{ margin: 0, color: "#fff", fontSize: "0.95rem", lineHeight: 1.5 }}>
                {data.result.publicSnapshot.detail}
              </p>
            </div>
            <div className="stack" style={{ padding: "clamp(20px, 3vw, 26px)", gap: 10 }}>
              {data.result.publicSnapshot.safeStats.map((stat) => (
                <div key={stat} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <Check size={17} aria-hidden style={{ flex: "0 0 auto", color: "var(--sage)", marginTop: 2 }} />
                  <span style={{ color: "var(--ink-dark)", fontWeight: 600 }}>{stat}</span>
                </div>
              ))}
              <span style={{ fontFamily: "var(--type-mono)", fontSize: "0.76rem", color: "var(--muted-ink-2)", marginTop: 4 }}>
                ✦ no names, no budgets, no notes
              </span>
            </div>
          </div>

          {/* Send it back to the group — dark tool-panel */}
          <div className="tool-panel stack">
            <h2 style={{ fontFamily: "var(--type-display)", fontWeight: 700, fontSize: "1.4rem", margin: 0, color: "var(--ink)" }}>
              Send it back to the group
            </h2>
            <div
              style={{
                borderRadius: "var(--radius)",
                border: "1px solid var(--line)",
                background: "rgba(0, 0, 0, 0.22)",
                color: "var(--muted-2)",
                padding: "14px 16px",
                lineHeight: 1.5,
                overflowWrap: "anywhere"
              }}
            >
              {generatedFinalMessage || data.result.finalMessage}
            </div>
            <div className="button-row">
              <button className="btn btn-primary" type="button" onClick={finalShare}>
                <Share2 size={18} aria-hidden />
                ✦ Drop in the chat
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={async () => {
                  setError("");
                  setMessage("");
                  try {
                    await copyText(generatedFinalMessage || data.result.finalMessage);
                    setMessage("Final message copied.");
                  } catch {
                    setError("Clipboard is unavailable. Copy the final message text from the card above.");
                  }
                }}
              >
                <Clipboard size={18} aria-hidden />
                Copy text
              </button>
              <Link className="btn btn-ghost" href={endpoints.reviewPath}>
                <MessageCircle size={18} aria-hidden />
                {endpoints.requiresAuth ? "My checks" : "Share guest link"}
              </Link>
              <button className="btn btn-ghost" type="button" onClick={() => load()}>
                <RefreshCw size={18} aria-hidden />
                Refresh
              </button>
            </div>
            {/* Feedback sits next to the actions that produce it (not at page bottom). */}
            {message ? (
              <div className="success-note" role="status" aria-live="polite">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="error-note" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
