export default function SupportPage() {
  const email = process.env.SUPPORT_EMAIL || "support@sayable.app";
  return (
    <main className="page-shell section-band stack">
      <span className="pill">Support</span>
      <h1 className="compact-title">Contact Sayable</h1>
      <p>
        For help with a Comfort Check, account deletion, payment smoke testing, abuse reports, or data questions, contact{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>
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
