import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), "apps/web/.env"));
loadEnvFile(resolve(process.cwd(), "apps/web/.env.local"));

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SAYABLE_STORE_BACKEND",
  "SAYABLE_TOKEN_ENCRYPTION_KEY"
];

const missing = required.filter((name) => !process.env[name]);
const serviceRoleKey = process.env.SAYABLE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  missing.push("SAYABLE_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY");
}
if (process.env.SAYABLE_STORE_BACKEND && process.env.SAYABLE_STORE_BACKEND !== "supabase") {
  missing.push("SAYABLE_STORE_BACKEND=supabase");
}

const status = {
  ok: false,
  publicAuth: "not_checked",
  serverStore: "not_checked",
  runtimeRpc: "not_checked",
  missing
};

async function checkPublicAuth() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`
    }
  });
  if (!response.ok) {
    throw new Error(`Supabase public auth settings returned ${response.status}`);
  }
  status.publicAuth = "ok";
}

async function checkServerStore() {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { error: selectError } = await client.from("comfort_checks").select("id").limit(1);
  if (selectError) {
    throw new Error(`comfort_checks select failed: ${selectError.message}`);
  }
  status.serverStore = "ok";

  const ownerId = `sayable-check-${process.pid}-${Date.now()}`;
  const { data, error: acquireError } = await client.rpc("try_acquire_sayable_store_lock", {
    p_lock_key: "sayable_runtime_store_check",
    p_owner_id: ownerId,
    p_ttl_seconds: 5
  });
  if (acquireError || data !== true) {
    throw new Error(`runtime lock RPC failed: ${acquireError?.message || "lock not acquired"}`);
  }
  const { error: releaseError } = await client.rpc("release_sayable_store_lock", {
    p_lock_key: "sayable_runtime_store_check",
    p_owner_id: ownerId
  });
  if (releaseError) {
    throw new Error(`runtime lock release failed: ${releaseError.message}`);
  }
  status.runtimeRpc = "ok";
}

try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    await checkPublicAuth();
  }
  if (missing.length === 0) {
    await checkServerStore();
  }
  status.ok = missing.length === 0 && status.publicAuth === "ok" && status.serverStore === "ok" && status.runtimeRpc === "ok";
  console.log(JSON.stringify(status, null, 2));
  process.exit(status.ok ? 0 : 1);
} catch (error) {
  status.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(status, null, 2));
  process.exit(1);
}
