import { readFileSync } from "node:fs";
import path from "node:path";

function staticAssert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceFile(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function assertFunctionGrant(migration, signature) {
  staticAssert(
    migration.includes(`grant execute on function ${signature} to service_role`),
    `${signature} must grant execute to service_role`
  );
  staticAssert(
    migration.includes(`revoke all on function ${signature} from public, anon, authenticated`),
    `${signature} must stay revoked from public/anon/authenticated`
  );
}

export function runStaticContractChecks() {
  const migration = sourceFile("supabase/migrations/0001_sayable_mvp.sql");
  assertFunctionGrant(
    migration,
    "public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)"
  );
  assertFunctionGrant(migration, "public.try_acquire_sayable_store_lock(text, text, integer)");
  assertFunctionGrant(migration, "public.release_sayable_store_lock(text, text)");
  staticAssert(
    !/select \*\s+from jsonb_to_recordset/.test(migration),
    "Supabase runtime replacement RPC must map json recordsets with named columns"
  );
}
