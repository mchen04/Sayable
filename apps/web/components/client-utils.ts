import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface HostSession {
  ownerUserId: string;
  token: string;
}

let browserAuthClient: SupabaseClient | null | undefined;

function isGoogleOAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";
}

function getBrowserAuthClient(): SupabaseClient | null {
  if (browserAuthClient !== undefined) {
    return browserAuthClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    browserAuthClient = null;
    return browserAuthClient;
  }
  browserAuthClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  return browserAuthClient;
}

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

function getStoredDemoSession(): HostSession | null {
  const raw = window.localStorage.getItem("sayable_demo_session");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as HostSession;
  } catch {
    window.localStorage.removeItem("sayable_demo_session");
    return null;
  }
}

export async function getDemoSession(): Promise<HostSession> {
  const stored = getStoredDemoSession();
  if (stored?.token && stored.ownerUserId) {
    return stored;
  }
  const response = await fetch("/api/auth/demo", { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not start Google demo session.");
  }
  const session = (await response.json()) as HostSession;
  window.localStorage.setItem("sayable_demo_session", JSON.stringify(session));
  window.localStorage.setItem("sayable_demo_user_id", session.ownerUserId);
  return session;
}

async function getSupabaseHostSession(): Promise<HostSession> {
  const client = getBrowserAuthClient();
  if (!client) {
    throw new Error("Supabase Google sign-in is not configured.");
  }
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  const ownerUserId = data.session?.user.id;
  if (token && ownerUserId) {
    return { token, ownerUserId };
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href
    }
  });
  if (error) {
    throw error;
  }
  throw new Error("Redirecting to Google sign-in.");
}

export async function getHostSession(): Promise<HostSession> {
  if (isGoogleOAuthEnabled()) {
    return getSupabaseHostSession();
  }
  return getDemoSession();
}

export async function getExistingHostSession(): Promise<HostSession | null> {
  if (!isGoogleOAuthEnabled()) {
    return getStoredDemoSession();
  }
  const client = getBrowserAuthClient();
  if (!client) {
    return null;
  }
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  const ownerUserId = data.session?.user.id;
  return token && ownerUserId ? { token, ownerUserId } : null;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const session = await getHostSession();
  return {
    Authorization: `Bearer ${session.token}`
  };
}

export async function existingAuthHeaders(): Promise<Record<string, string>> {
  const session = await getExistingHostSession();
  if (!session?.token) {
    return {};
  }
  return {
    Authorization: `Bearer ${session.token}`
  };
}

// postAnalytics and copyText moved to ./client-io (Supabase-free) so always-on
// consumers don't pull @supabase/supabase-js into first-load JS.
