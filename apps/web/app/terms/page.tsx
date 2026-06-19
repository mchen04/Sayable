export default function TermsPage() {
  return (
    <main className="page-shell section-band stack">
      <span className="pill">Terms</span>
      <h1 className="compact-title">Terms of Use</h1>
      <p>
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
