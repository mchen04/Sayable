import Link from "next/link";

/* Demo "Comfortable" read used purely for the marketing illustration.
   Mirrors packages/core: 4 in · 2 maybe · 1 out → "Lock it in" / 71% comfort. */
const DEMO_DOTS = ["#46B377", "#46B377", "#46B377", "#46B377", "#E0A93A", "#E0A93A", "#DD7355"];

export default function LandingPage() {
  return (
    <main className="rise">
      {/* ============ HERO ============ */}
      <section className="page-shell" style={{ padding: "clamp(28px,5vw,64px) 0 clamp(20px,4vw,40px)" }}>
        <div className="eyebrow">A comfort check — not a poll</div>
        <h1 className="hero-copy" style={{ margin: "18px 0 0" }}>
          <span
            style={{
              fontFamily: "var(--type-display)",
              fontWeight: 800,
              fontSize: "clamp(3.1rem,9vw,8rem)",
              lineHeight: 0.88,
              letterSpacing: "-0.04em",
              display: "block",
              maxWidth: "15ch"
            }}
          >
            Is everyone <span className="serif serif-lime">actually</span> into it?
          </span>
        </h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 44, alignItems: "flex-end", marginTop: 30 }}>
          <div style={{ flex: "1 1 380px", minWidth: 280 }}>
            <p style={{ fontSize: "clamp(1.1rem,1.9vw,1.4rem)", lineHeight: 1.5, color: "var(--muted-2)", maxWidth: "40ch", margin: 0 }}>
              You&apos;re planning dinner, a trip, a birthday. Drop{" "}
              <em className="serif" style={{ color: "var(--ink)", fontSize: "1.1em" }}>
                one link
              </em>{" "}
              in the group chat — people privately tap yes, maybe, or out. You get the honest group read. No names. No budgets. No
              drama.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/create">
                Make a Comfort Check →
              </Link>
              <a className="btn btn-ghost" href="#payoff">
                Peek at a result
              </a>
            </div>
          </div>

          {/* tilted share sticker */}
          <div style={{ flex: "0 0 auto", width: "min(380px,90vw)", position: "relative", transform: "rotate(2.5deg)" }}>
            <span
              className="sticker honey floaty"
              style={{ position: "absolute", top: -16, left: -14, zIndex: 3, transform: "rotate(-9deg)" }}
            >
              one tap ✦ private
            </span>
            <div className="share-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 13, borderBottom: "1.5px dashed #DAD0BD" }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    background: "var(--bg)",
                    color: "var(--lime)",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "var(--type-display)",
                    fontWeight: 800
                  }}
                >
                  G
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", whiteSpace: "nowrap" }}>the group chat</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted-ink-2)", whiteSpace: "nowrap" }}>5 people · just now</div>
                </div>
              </div>
              <div className="chat-bubble" style={{ margin: "14px 8px 12px 0" }}>
                <div className="title">Friday dinner before the show</div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted-ink)", lineHeight: 1.4 }}>
                  One tap, fully private — no names, no budgets shown.
                </div>
                <div className="chat-url">sayable.app/c/v7k2</div>
              </div>
              <div style={{ background: "var(--bg)", color: "var(--ink)", borderRadius: 18, padding: 15 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span
                    style={{
                      fontFamily: "var(--type-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#8E8675"
                    }}
                  >
                    live read
                  </span>
                  <span className="verdict-chip tone-green" style={{ fontSize: "0.78rem", padding: "5px 11px" }}>
                    Lock it in
                  </span>
                </div>
                <div className="dot-row">
                  {DEMO_DOTS.map((color, i) => (
                    <span key={i} className="dot" style={{ width: 17, height: 17, background: color }} />
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: "0.82rem", color: "#A9A091" }}>4 in · 2 maybe · 1 out</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ticker */}
      <div className="page-shell">
        <div className="ticker">
          <div className="ticker-track">
            {[0, 1].map((k) => (
              <span key={k}>
                PRIVATE BY DEFAULT&nbsp;&nbsp;<span style={{ color: "var(--lime)" }}>✦</span>&nbsp;&nbsp;NO NAMES&nbsp;&nbsp;
                <span style={{ color: "var(--sage)" }}>✦</span>&nbsp;&nbsp;NO BUDGETS SHOWN&nbsp;&nbsp;
                <span style={{ color: "var(--honey-2)" }}>✦</span>&nbsp;&nbsp;NO PRIVATE NOTES&nbsp;&nbsp;
                <span style={{ color: "var(--clay)" }}>✦</span>&nbsp;&nbsp;ANSWER IN UNDER A MINUTE&nbsp;&nbsp;
                <span style={{ color: "var(--lime)" }}>✦</span>&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* editorial how it works */}
      <section className="page-shell section-band" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="sr-only">
          How Sayable works
        </h2>
        <div className="editorial-row">
          <div className="editorial-num">01</div>
          <div className="editorial-body">
            <h3>Name the plan.</h3>
            <p>
              Type what you&apos;re thinking — &ldquo;Friday dinner before the show.&rdquo; Sayable writes the questions, the comfort
              options, and a clean message for the chat. Twenty seconds, no account.
            </p>
          </div>
        </div>
        <div className="editorial-row">
          <div className="editorial-num honey">02</div>
          <div className="editorial-body">
            <h3>Drop the link.</h3>
            <p>
              Everyone taps <span style={{ color: "var(--sage)", fontWeight: 700 }}>yes</span>,{" "}
              <span style={{ color: "var(--honey-2)", fontWeight: 700 }}>maybe</span>, or{" "}
              <span style={{ color: "var(--clay)", fontWeight: 700 }}>out</span> — and flags what matters to them, privately, on their
              own phone.
            </p>
          </div>
        </div>
        <div className="editorial-row">
          <div className="editorial-num clay">03</div>
          <div className="editorial-body">
            <h3>Read the room.</h3>
            <p>
              You get a privacy-safe group read — the{" "}
              <em className="serif" style={{ color: "var(--ink)", fontSize: "1.1em" }}>
                shape
              </em>{" "}
              of the group, never the people in it. Lock it in, or tweak before you commit.
            </p>
          </div>
        </div>
      </section>

      {/* the human payoff */}
      <section className="page-shell section-band">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(28px,5vw,64px)", alignItems: "center" }}>
          <div style={{ flex: "0 0 auto", width: "min(460px,92vw)", position: "relative", transform: "rotate(-2deg)" }}>
            <span className="sticker floaty" style={{ position: "absolute", top: -16, right: 14, zIndex: 3, transform: "rotate(6deg)" }}>
              when it actually works ✦
            </span>
            <div style={{ background: "var(--paper)", padding: "14px 14px 18px", borderRadius: 24, boxShadow: "0 44px 86px -34px rgba(0,0,0,.75)" }}>
              <div
                aria-hidden
                style={{
                  display: "block",
                  width: "100%",
                  aspectRatio: "4 / 3",
                  borderRadius: 16,
                  background:
                    "radial-gradient(120% 90% at 20% 10%, rgba(198,242,78,.5), transparent 55%), radial-gradient(120% 90% at 90% 90%, rgba(221,115,85,.45), transparent 55%), linear-gradient(135deg,#46B377,#15120D)"
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "0 4px" }}>
                <span style={{ fontFamily: "var(--type-display)", fontWeight: 700, color: "var(--ink-dark)", fontSize: "1rem" }}>
                  Friday dinner — it happened.
                </span>
                <span style={{ fontFamily: "var(--type-mono)", fontSize: "0.72rem", color: "var(--muted-ink-2)" }}>5 / 5 showed</span>
              </div>
            </div>
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <div className="eyebrow">the whole point</div>
            <h2 style={{ fontFamily: "var(--type-display)", fontWeight: 800, fontSize: "clamp(2rem,4.2vw,3.4rem)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: "14px 0 0" }}>
              It was never about the <span className="serif serif-lime">poll</span>.
            </h2>
            <p style={{ color: "var(--muted)", fontSize: "1.12rem", lineHeight: 1.55, margin: "16px 0 0", maxWidth: "42ch" }}>
              It&apos;s the dinner that actually happens — because nobody got quietly talked into something they didn&apos;t want. You
              see faces here. In the check itself, you never do.
            </p>
          </div>
        </div>
      </section>

      {/* payoff + public-safe snapshot */}
      <section className="page-shell section-band" id="payoff">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(28px,5vw,56px)", alignItems: "center" }}>
          <div style={{ flex: "1 1 340px", minWidth: 280 }}>
            <div className="eyebrow">the payoff</div>
            <h2 style={{ fontFamily: "var(--type-display)", fontWeight: 800, fontSize: "clamp(2.2rem,4.5vw,3.6rem)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: "14px 0 0" }}>
              A read you can share — that gives <span className="serif serif-lime">nobody</span> away.
            </h2>
            <p style={{ color: "var(--muted)", fontSize: "1.12rem", lineHeight: 1.55, margin: "16px 0 0", maxWidth: "44ch" }}>
              Small groups stay hidden until enough people answer. Individual budgets and private notes never leave the phone they
              were typed on. You see whether to go — not who said what.
            </p>
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 280, transform: "rotate(-1.5deg)" }}>
            <div className="snapshot">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--type-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-ink-2)" }}>
                  public-safe snapshot
                </span>
                <span className="verdict-chip tone-green" style={{ fontSize: "0.85rem", padding: "6px 12px" }}>
                  Lock it in
                </span>
              </div>
              <h3 style={{ fontFamily: "var(--type-display)", fontWeight: 800, fontSize: "1.7rem", letterSpacing: "-0.02em", margin: "16px 0 4px" }}>
                The group&apos;s comfortable
              </h3>
              <p style={{ margin: 0, color: "var(--muted-ink)", fontSize: "0.95rem" }}>7 private responses · no names, no budgets, no notes</p>
              <div className="dot-row" style={{ margin: "18px 0" }}>
                {DEMO_DOTS.map((color, i) => (
                  <span key={i} className="dot" style={{ background: color }} />
                ))}
              </div>
              <div className="gauge">
                <span style={{ width: "71%" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.8rem", color: "var(--muted-ink-2)", fontWeight: 600 }}>
                <span>Comfort range</span>
                <span style={{ color: "var(--ink-dark)" }}>Comfortable</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
