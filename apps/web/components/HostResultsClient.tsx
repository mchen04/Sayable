"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { getTheme, type ComfortDraft, type PlanTier } from "@sayable/core";
import { Clipboard, MessageCircle, RefreshCw, Share2, ShieldCheck } from "lucide-react";
import { copyText, postAnalytics } from "./client-utils";

let realtimeClient: SupabaseClient | null | undefined;

interface HostResultData {
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

export default function HostResultsClient({ hostToken }: { hostToken: string }) {
  const [data, setData] = useState<HostResultData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generatedFinalMessage, setGeneratedFinalMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [syncMode, setSyncMode] = useState<"connecting" | "live" | "refresh">("connecting");
  const theme = useMemo(() => getTheme(data?.check.themeId), [data?.check.themeId]);

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }
      try {
        const response = await fetch(`/api/checks/host/${hostToken}`, { cache: "no-store" });
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
    [hostToken]
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(() => {
      void load(false);
    }, 7000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

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
      const response = await fetch(`/api/checks/host/${hostToken}/final-share`, { method: "POST" });
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
  const themeIcon = data.check.customTheme?.icon || theme.icon;

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
      <div className="grid-two">
        <section className="stack">
          <span className="pill">
            <ShieldCheck size={15} aria-hidden />
            Host results
          </span>
          <h1 className="compact-title">{data.check.title}</h1>
          <p className="muted">{data.check.draft.finalSharePrompt}</p>
          <p className="muted" role="status">
            {syncMode === "live"
              ? "Live results are on."
              : syncMode === "connecting"
                ? "Connecting live results..."
                : "Live results are reconnecting; periodic refresh is on."}
          </p>
          <div className="grid-two">
            <div className="result-panel">
              <span className="pill">{data.result.responseCount}</span>
              <h2>Responses</h2>
              <p className="muted">
                {data.deletedResponseCount ? `${data.deletedResponseCount} deleted response ignored. ` : ""}
                {data.result.isPrivacySuppressed
                  ? `Detailed aggregate hidden until ${data.result.privacyThreshold} responses.`
                  : "Aggregate is privacy-safe."}
              </p>
            </div>
            <div className="result-panel">
              <span className="pill">{data.check.plan}</span>
              <h2>{data.result.bestFit.label}</h2>
              <p className="muted">{data.result.bestFit.detail}</p>
            </div>
          </div>
          <div className="result-panel stack">
            <h2>Comfort range</h2>
            <strong>{data.result.comfortRange.label}</strong>
            <span className="muted">{data.result.comfortRange.detail}</span>
            {data.result.currentIdeaWarning ? <div className="status-note">{data.result.currentIdeaWarning}</div> : null}
          </div>
        </section>

        <aside className="stack">
          <div className="tool-panel stack">
            <h2>Grouped constraints</h2>
            {data.result.groupedConstraints.length ? (
              data.result.groupedConstraints.map((constraint) => (
                <div className="choice" key={constraint.id}>
                  <span className="pill">{constraint.signal}</span>
                  <div>
                    <strong>{constraint.label}</strong>
                    <span>{constraint.detail}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="status-note">
                {data.result.isPrivacySuppressed
                  ? "Constraint details stay hidden until the privacy threshold is met."
                  : "No major constraints selected yet."}
              </div>
            )}
          </div>

          <div className="message-preview">
            <div className="preview-art">
              <div className="theme-icon-badge" aria-hidden>
                {themeIcon}
              </div>
              <span className="pill">Public-safe snapshot</span>
              <h2>{data.result.publicSnapshot.headline}</h2>
              <p>{data.result.publicSnapshot.detail}</p>
            </div>
            <div className="preview-card">
              {data.result.publicSnapshot.safeStats.map((stat) => (
                <div key={stat}>{stat}</div>
              ))}
            </div>
          </div>

          <div className="tool-panel stack">
            <h2>Final group message</h2>
            <div className="status-note">{generatedFinalMessage || data.result.finalMessage}</div>
            <div className="button-row">
              <button className="btn btn-primary" type="button" onClick={finalShare}>
                <Share2 size={18} aria-hidden />
                Share final message
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => copyText(data.result.finalMessage)}>
                <Clipboard size={18} aria-hidden />
                Copy text
              </button>
              <Link className="btn btn-ghost" href={`/checks/${hostToken}/review`}>
                <MessageCircle size={18} aria-hidden />
                Share guest link
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <div className="button-row" style={{ marginTop: 24 }}>
        <button className="btn btn-ghost" type="button" onClick={() => load()}>
          <RefreshCw size={18} aria-hidden />
          Refresh
        </button>
      </div>
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
    </main>
  );
}
