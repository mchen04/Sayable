"use client";

import { useState } from "react";
import { authHeaders } from "./client-utils";

export default function DeleteAccountClient() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteAccount() {
    setError("");
    setMessage("");
    setIsDeleting(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: await authHeaders()
      });
      const payload = (await response.json()) as { deletedChecks?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Account deletion could not be completed.");
      }
      window.localStorage.removeItem("sayable_demo_session");
      window.localStorage.removeItem("sayable_demo_user_id");
      window.localStorage.removeItem("sayable_host_token_by_check_id");
      setMessage(`Account deletion completed. ${payload.deletedChecks || 0} saved Comfort Checks were deleted.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account deletion could not be completed.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="tool-panel stack">
      <h2>Account</h2>
      <p className="muted">
        Signed-in hosts can delete account-owned Comfort Checks. This removes saved checks from the dashboard and
        anonymizes guest response details for those checks.
      </p>
      <button className="btn btn-primary" type="button" onClick={deleteAccount} disabled={isDeleting}>
        {isDeleting ? "Deleting..." : "Continue with Google to delete account data"}
      </button>
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
    </div>
  );
}
