import Link from "next/link";
import DeleteAccountClient from "@/components/DeleteAccountClient";

export default function DeletePage() {
  return (
    <main className="page-shell section-band stack" style={{ paddingTop: "clamp(20px,3vw,40px)" }}>
      <div className="eyebrow">Data rights ✦ delete</div>
      <h1 className="compact-title">
        Deletion <span className="serif serif-lime">paths</span>
      </h1>
      <p className="muted" style={{ fontSize: "1.12rem", maxWidth: "60ch" }}>
        Every Comfort Check can be removed — pick the path that matches who you are.
      </p>
      <div className="grid-three">
        <div className="tool-panel stack">
          <h2>Guest response</h2>
          <p className="muted">Open your original guest link on the same device and choose Delete response.</p>
        </div>
        <div className="tool-panel stack">
          <h2>Host check</h2>
          <p className="muted">Open the host review link, close/delete from operator tools, or contact support.</p>
        </div>
        <DeleteAccountClient />
      </div>
      <Link className="btn btn-primary" href="/support">
        Contact support
      </Link>
    </main>
  );
}
