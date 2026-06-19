import CreateCheckForm from "@/components/CreateCheckForm";
import { Lock, MessageCircle, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <main>
      <section className="page-shell hero">
        <div className="hero-copy">
          <span className="pill">
            <Sparkles size={15} aria-hidden />
            iMessage-first group planning
          </span>
          <h1>Comfort Check</h1>
          <p>
            Before you lock in dinner, tickets, a birthday plan, or a trip, send one private Sayable link. Guests answer
            without accounts, and the host gets the group-safe takeaway.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#create">
              Start creating
            </a>
            <a className="btn btn-secondary" href="#example-flow">
              View guest/result example
            </a>
          </div>
        </div>
        <div id="create">
          <CreateCheckForm compact />
        </div>
      </section>

      <section className="section-band" id="example-flow">
        <div className="page-shell grid-two">
          <div className="section-heading">
            <span className="pill">
              <MessageCircle size={15} aria-hidden />
              Messages preview
            </span>
            <h2>Built to feel natural in the group chat.</h2>
            <p>
              Shared links show the check title, Comfort Check context, activity type, and a clean preview image. Host
              links, private notes, response tokens, and budget answers never appear in preview copy.
            </p>
          </div>
          <div className="phone-frame" aria-label="Sayable product flow preview">
            <div className="phone-top" />
            <div className="flow-showcase">
              <div className="flow-card">
                <span className="pill">Host review</span>
                <h3>Friday dinner before the show</h3>
                <p className="muted">Ready to share. Editing is optional.</p>
                <div className="button-row">
                  <span className="btn btn-primary">Share in Messages</span>
                </div>
              </div>
              <div className="flow-card">
                <span className="pill">Guest answer</span>
                <h3>Private guest link</h3>
                <div className="mini-choice">
                  <span className="mini-dot" />
                  Easy yes
                </div>
                <div className="mini-choice">Keep the bill comfortable</div>
              </div>
              <div className="flow-card">
                <span className="pill">Public-safe result</span>
                <h3>Works with tweaks</h3>
                <p className="muted">4 private responses. No names or private notes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="page-shell grid-three">
          <div className="tool-panel">
            <span className="pill">1</span>
            <h3>Auto-drafted</h3>
            <p className="muted">Questions, comfort tiers, constraints, share text, and privacy copy come from rules.</p>
          </div>
          <div className="tool-panel">
            <span className="pill">2</span>
            <h3>No guest login</h3>
            <p className="muted">Guests open the link, answer in under a minute, and can edit or delete by token.</p>
          </div>
          <div className="tool-panel">
            <span className="pill">
              <Lock size={14} aria-hidden />
            </span>
            <h3>Privacy-safe results</h3>
            <p className="muted">Small groups are suppressed, notes stay private, and named budget answers are hidden.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
