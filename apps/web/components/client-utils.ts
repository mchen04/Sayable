export function getDemoUserId(): string {
  const session = getStoredDemoSession();
  if (session) {
    return session.ownerUserId;
  }
  const key = "sayable_demo_user_id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const created = `demo_${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

interface DemoSession {
  ownerUserId: string;
  token: string;
}

function getStoredDemoSession(): DemoSession | null {
  const raw = window.localStorage.getItem("sayable_demo_session");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as DemoSession;
  } catch {
    window.localStorage.removeItem("sayable_demo_session");
    return null;
  }
}

export async function getDemoSession(): Promise<DemoSession> {
  const stored = getStoredDemoSession();
  if (stored?.token && stored.ownerUserId) {
    return stored;
  }
  const response = await fetch("/api/auth/demo", { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not start Google demo session.");
  }
  const session = (await response.json()) as DemoSession;
  window.localStorage.setItem("sayable_demo_session", JSON.stringify(session));
  window.localStorage.setItem("sayable_demo_user_id", session.ownerUserId);
  return session;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const session = await getDemoSession();
  return {
    Authorization: `Bearer ${session.token}`
  };
}

export function existingAuthHeaders(): Record<string, string> {
  const session = getStoredDemoSession();
  if (!session?.token) {
    return {};
  }
  return {
    Authorization: `Bearer ${session.token}`
  };
}

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
