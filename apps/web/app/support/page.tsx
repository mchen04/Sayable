export default function SupportPage() {
  const email = process.env.SUPPORT_EMAIL || "support@sayable.app";
  return (
    <main className="page-shell section-band stack" style={{ paddingTop: "clamp(20px,3vw,40px)" }}>
      <div className="eyebrow">We&apos;re here ✦ support</div>
      <h1 className="compact-title">
        Contact <span className="serif serif-lime">Sayable</span>
      </h1>
      <p className="muted" style={{ fontSize: "1.12rem", maxWidth: "60ch" }}>
        For help with a Comfort Check, account deletion, payment smoke testing, abuse reports, or data questions, contact{" "}
        <a href={`mailto:${email}`} style={{ color: "var(--lime)", fontWeight: 700 }}>
          {email}
        </a>
        .
      </p>
      <a className="btn btn-primary" href={`mailto:${email}`} style={{ alignSelf: "flex-start" }}>
        Email {email}
      </a>
      <div className="tool-panel stack">
        <h2>Useful details</h2>
        <p className="muted">
          Include the check title, approximate creation time, and whether you are the host or a guest. Do not send private
          response tokens in screenshots unless support specifically asks for them.
        </p>
      </div>
    </main>
  );
}
