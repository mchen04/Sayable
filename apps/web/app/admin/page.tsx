export default function AdminPage() {
  return (
    <main className="page-shell section-band stack" style={{ paddingTop: "clamp(20px,3vw,40px)" }}>
      <div className="eyebrow">Operator path ✦ admin</div>
      <h1 className="compact-title">
        Admin <span className="serif serif-lime">investigation</span>
      </h1>
      <p className="muted" style={{ fontSize: "1.12rem", maxWidth: "62ch" }}>
        The MVP exposes <code>GET /api/admin</code> with <code>x-sayable-admin-token</code> for local operator checks. It
        returns redacted recent checks, responses, purchases, abuse events, audit logs, and analytics events.
      </p>
      <div className="tool-panel stack">
        <h2>Close or delete a check</h2>
        <p className="muted">
          Send <code>POST /api/admin</code> with <code>{"{ \"hostToken\": \"...\", \"action\": \"close\" }"}</code> or{" "}
          <code>delete</code>. Admin actions are audit logged.
        </p>
      </div>
      <div className="tool-panel stack">
        <h2>Supabase dashboard</h2>
        <p className="muted">
          Production operations should use the documented Supabase SQL snippets and never put a service-role key in the
          client bundle.
        </p>
      </div>
    </main>
  );
}
