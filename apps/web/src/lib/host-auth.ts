import "server-only";

import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import WebSocket from "ws";
import { isDemoAuthEnabled, verifyDemoToken } from "./demo-auth";
import { StoreError } from "./store-types";

export interface HostSession {
  sub: string;
  actor: "demo_user" | "host";
  mode: "demo_feature_flag" | "supabase_oauth";
}

let supabaseAuthClient: SupabaseClient | undefined;
type RealtimeTransport = NonNullable<NonNullable<SupabaseClientOptions<"public">["realtime"]>["transport"]>;
const WebSocketTransport = WebSocket as unknown as RealtimeTransport;

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
}

function isLikelyDemoToken(token: string): boolean {
  return token.split(".").length === 2;
}

function getSupabaseAuthClient(): SupabaseClient {
  if (supabaseAuthClient) {
    return supabaseAuthClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new StoreError(500, "Supabase Auth is not configured for Google sign-in.");
  }
  supabaseAuthClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    realtime: {
      transport: WebSocketTransport
    }
  });
  return supabaseAuthClient;
}

async function verifySupabaseBearer(token: string): Promise<HostSession> {
  const { data, error } = await getSupabaseAuthClient().auth.getUser(token);
  if (error || !data.user?.id) {
    throw new StoreError(401, "Sign in with Google before continuing.");
  }
  return {
    sub: data.user.id,
    actor: "host",
    mode: "supabase_oauth"
  };
}

export async function requireHostSession(request: NextRequest): Promise<HostSession> {
  const token = bearerToken(request);
  if (!token) {
    throw new StoreError(401, "Sign in with Google before continuing.");
  }
  if (isDemoAuthEnabled() && isLikelyDemoToken(token)) {
    const session = verifyDemoToken(token);
    return {
      sub: session.sub,
      actor: "demo_user",
      mode: "demo_feature_flag"
    };
  }
  return verifySupabaseBearer(token);
}

export async function optionalHostSession(request: NextRequest): Promise<HostSession | undefined> {
  if (!bearerToken(request)) {
    return undefined;
  }
  return requireHostSession(request);
}
