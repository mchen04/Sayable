export default function TermsPage() {
  return (
    <main className="page-shell section-band stack" style={{ paddingTop: "clamp(20px,3vw,40px)" }}>
      <div className="eyebrow">The fine print ✦ terms</div>
      <h1 className="compact-title">
        Terms of <span className="serif serif-lime">Use</span>
      </h1>
      <p className="muted" style={{ fontSize: "1.12rem", maxWidth: "60ch" }}>
        Sayable is an MVP for private group planning comfort checks. Do not use it for emergencies, regulated financial
        decisions, medical decisions, or collecting sensitive identity information.
      </p>
      <div className="tool-panel stack">
        <h2>Payments</h2>
        <p className="muted">
          Premium Check is a $4.99 one-time per-check upgrade. This MVP runs Stripe in mock mode unless real Stripe test
          keys are configured.
        </p>
      </div>
      <div className="tool-panel stack">
        <h2>Acceptable use</h2>
        <p className="muted">
          Do not brute-force links, submit abusive content, attempt to access another host's links, or use Sayable to
          harass people.
        </p>
      </div>
    </main>
  );
}
