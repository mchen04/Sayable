import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="page-shell section-band stack">
      <span className="pill">Privacy</span>
      <h1 className="compact-title">Privacy Policy</h1>
      <p>
        Sayable collects the minimum data needed to create a Comfort Check, collect no-login guest responses, calculate
        privacy-safe aggregate results, and help hosts share final group messages.
      </p>
      <div className="tool-panel stack">
        <h2>Guest answers</h2>
        <p className="muted">
          Guests do not need accounts. Hosts see grouped comfort patterns and grouped constraints. Private notes never
          appear in public snapshots. Named budget answers are not shown.
        </p>
      </div>
      <div className="tool-panel stack">
        <h2>Retention</h2>
        <p className="muted">
          Free Comfort Checks expire after 30 days. Premium Checks expire after 180 days. Expired checks stop accepting
          changes, and hosts can delete checks earlier; guests can delete responses with their response token.
        </p>
      </div>
      <div className="tool-panel stack">
        <h2>Security</h2>
        <p className="muted">
          Host, result, and response tokens are long random tokens and are stored hashed at rest. Public endpoints apply
          validation and rate limits. Supabase RLS policies are documented in the migration.
        </p>
      </div>
      <Link className="btn btn-primary" href="/delete">
        Deletion options
      </Link>
    </main>
  );
}
