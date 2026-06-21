// Supabase-free client helpers. Kept separate from client-utils.ts (which imports
// @supabase/supabase-js for auth) so that always-on consumers like WebAnalytics —
// rendered in the root layout on every route — do NOT pull the ~225KB Supabase
// client into the first-load JS of public pages (landing, legal, guest, result).

export async function postAnalytics(name: string, context: Record<string, string | number | boolean | null> = {}) {
  await fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, context })
  }).catch(() => undefined);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  if (!copied) {
    throw new Error("Clipboard is unavailable.");
  }
}
