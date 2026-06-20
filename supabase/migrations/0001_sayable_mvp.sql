create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.comfort_checks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text,
  title text not null,
  activity_type text not null check (
    activity_type in ('dinner_drinks', 'birthday', 'casual_hangout', 'tickets_event', 'group_trip', 'home_chill', 'custom')
  ),
  plan text not null default 'free' check (plan in ('free', 'premium')),
  status text not null default 'active' check (status in ('active', 'closed', 'deleted', 'expired')),
  draft jsonb not null,
  theme_id text not null default 'sayable_default',
  custom_theme jsonb,
  guest_token_ciphertext text not null,
  guest_token_hash text not null unique,
  host_token_hash text not null unique,
  result_token_hash text not null unique,
  created_by_fingerprint_hash text,
  creator_nonce_hash text,
  expires_at timestamptz not null,
  final_shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.comfort_checks(id) on delete cascade,
  response_token_hash text not null unique,
  status text not null check (status in ('in', 'maybe', 'out')),
  tier_id text not null,
  constraint_ids text[] not null default '{}',
  private_note text,
  client_nonce_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.result_snapshots (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.comfort_checks(id) on delete cascade,
  result_token_hash text not null unique,
  snapshot jsonb not null,
  public_safe boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.comfort_checks(id) on delete cascade,
  owner_user_id text,
  product_type text not null check (product_type = 'premium_check_upgrade'),
  amount_cents integer not null check (amount_cents = 499),
  mode text not null check (mode in ('mock', 'test')),
  status text not null check (status in ('started', 'completed', 'failed', 'cancelled')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.comfort_checks(id) on delete set null,
  owner_user_id text,
  event_name text not null,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.comfort_checks(id) on delete set null,
  owner_user_id text,
  actor_type text not null check (actor_type in ('anonymous', 'guest', 'host', 'demo_user', 'admin', 'system')),
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table public.abuse_events (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.comfort_checks(id) on delete set null,
  route text not null,
  reason text not null,
  fingerprint_hash text not null,
  created_at timestamptz not null default now()
);

create table public.sayable_store_locks (
  lock_key text primary key,
  owner_id text not null,
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comfort_checks_owner_idx on public.comfort_checks(owner_user_id);
create index comfort_checks_guest_token_idx on public.comfort_checks(guest_token_hash);
create index comfort_checks_host_token_idx on public.comfort_checks(host_token_hash);
create index comfort_checks_result_token_idx on public.comfort_checks(result_token_hash);
create index responses_check_idx on public.responses(check_id) where deleted_at is null;
create index responses_token_idx on public.responses(response_token_hash);
create index purchases_check_idx on public.purchases(check_id);
create index analytics_events_name_created_idx on public.analytics_events(event_name, created_at desc);
create index audit_logs_check_created_idx on public.audit_logs(check_id, created_at desc);
create index abuse_events_created_idx on public.abuse_events(created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger comfort_checks_set_updated_at
before update on public.comfort_checks
for each row execute function public.set_updated_at();

create trigger responses_set_updated_at
before update on public.responses
for each row execute function public.set_updated_at();

create trigger purchases_set_updated_at
before update on public.purchases
for each row execute function public.set_updated_at();

create trigger sayable_store_locks_set_updated_at
before update on public.sayable_store_locks
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.comfort_checks enable row level security;
alter table public.responses enable row level security;
alter table public.result_snapshots enable row level security;
alter table public.purchases enable row level security;
alter table public.analytics_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.abuse_events enable row level security;
alter table public.sayable_store_locks enable row level security;

create or replace function public.try_acquire_sayable_store_lock(
  p_lock_key text,
  p_owner_id text,
  p_ttl_seconds integer default 20
)
returns boolean
language plpgsql
as $$
declare
  updated_count integer;
begin
  insert into public.sayable_store_locks(lock_key, owner_id, locked_until)
  values (p_lock_key, p_owner_id, now() + make_interval(secs => p_ttl_seconds))
  on conflict (lock_key) do nothing;

  if found then
    return true;
  end if;

  update public.sayable_store_locks
  set owner_id = p_owner_id,
      locked_until = now() + make_interval(secs => p_ttl_seconds)
  where lock_key = p_lock_key
    and (locked_until < now() or owner_id = p_owner_id);

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

create or replace function public.release_sayable_store_lock(
  p_lock_key text,
  p_owner_id text
)
returns void
language plpgsql
as $$
begin
  update public.sayable_store_locks
  set locked_until = now()
  where lock_key = p_lock_key
    and owner_id = p_owner_id;
end;
$$;

revoke all on function public.try_acquire_sayable_store_lock(text, text, integer) from public, anon, authenticated;
grant execute on function public.try_acquire_sayable_store_lock(text, text, integer) to service_role;
revoke all on function public.release_sayable_store_lock(text, text) from public, anon, authenticated;
grant execute on function public.release_sayable_store_lock(text, text) to service_role;

create or replace function public.replace_sayable_runtime_store(
  p_checks jsonb,
  p_responses jsonb,
  p_purchases jsonb,
  p_result_snapshots jsonb,
  p_analytics_events jsonb,
  p_audit_logs jsonb,
  p_abuse_events jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audit_logs where true;
  delete from public.analytics_events where true;
  delete from public.abuse_events where true;
  delete from public.result_snapshots where true;
  delete from public.purchases where true;
  delete from public.responses where true;
  delete from public.comfort_checks where true;

  insert into public.comfort_checks (
    id,
    owner_user_id,
    title,
    activity_type,
    plan,
    status,
    draft,
    theme_id,
    custom_theme,
    guest_token_ciphertext,
    guest_token_hash,
    host_token_hash,
    result_token_hash,
    created_by_fingerprint_hash,
    creator_nonce_hash,
    expires_at,
    final_shared_at,
    created_at,
    updated_at
  )
  select
    row.id,
    row.owner_user_id,
    row.title,
    row.activity_type,
    row.plan,
    row.status,
    row.draft,
    row.theme_id,
    row.custom_theme,
    row.guest_token_ciphertext,
    row.guest_token_hash,
    row.host_token_hash,
    row.result_token_hash,
    row.created_by_fingerprint_hash,
    row.creator_nonce_hash,
    row.expires_at,
    row.final_shared_at,
    row.created_at,
    row.updated_at
  from jsonb_to_recordset(coalesce(p_checks, '[]'::jsonb)) as row(
    id uuid,
    owner_user_id text,
    title text,
    activity_type text,
    plan text,
    status text,
    draft jsonb,
    theme_id text,
    custom_theme jsonb,
    guest_token_ciphertext text,
    guest_token_hash text,
    host_token_hash text,
    result_token_hash text,
    created_by_fingerprint_hash text,
    creator_nonce_hash text,
    expires_at timestamptz,
    final_shared_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  );

  insert into public.responses (
    id,
    check_id,
    response_token_hash,
    status,
    tier_id,
    constraint_ids,
    private_note,
    client_nonce_hash,
    created_at,
    updated_at,
    deleted_at
  )
  select
    row.id,
    row.check_id,
    row.response_token_hash,
    row.status,
    row.tier_id,
    row.constraint_ids,
    row.private_note,
    row.client_nonce_hash,
    row.created_at,
    row.updated_at,
    row.deleted_at
  from jsonb_to_recordset(coalesce(p_responses, '[]'::jsonb)) as row(
    id uuid,
    check_id uuid,
    response_token_hash text,
    status text,
    tier_id text,
    constraint_ids text[],
    private_note text,
    client_nonce_hash text,
    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz
  );

  insert into public.purchases (
    id,
    check_id,
    owner_user_id,
    product_type,
    amount_cents,
    mode,
    status,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    created_at
  )
  select
    row.id,
    row.check_id,
    row.owner_user_id,
    row.product_type,
    row.amount_cents,
    row.mode,
    row.status,
    row.stripe_checkout_session_id,
    row.stripe_payment_intent_id,
    row.created_at
  from jsonb_to_recordset(coalesce(p_purchases, '[]'::jsonb)) as row(
    id uuid,
    check_id uuid,
    owner_user_id text,
    product_type text,
    amount_cents integer,
    mode text,
    status text,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    created_at timestamptz
  );

  insert into public.result_snapshots (
    id,
    check_id,
    result_token_hash,
    snapshot,
    created_at,
    deleted_at
  )
  select
    row.id,
    row.check_id,
    row.result_token_hash,
    row.snapshot,
    row.created_at,
    row.deleted_at
  from jsonb_to_recordset(coalesce(p_result_snapshots, '[]'::jsonb)) as row(
    id uuid,
    check_id uuid,
    result_token_hash text,
    snapshot jsonb,
    created_at timestamptz,
    deleted_at timestamptz
  );

  insert into public.analytics_events (
    id,
    check_id,
    event_name,
    context,
    created_at
  )
  select
    row.id,
    row.check_id,
    row.event_name,
    row.context,
    row.created_at
  from jsonb_to_recordset(coalesce(p_analytics_events, '[]'::jsonb)) as row(
    id uuid,
    check_id uuid,
    event_name text,
    context jsonb,
    created_at timestamptz
  );

  insert into public.audit_logs (
    id,
    check_id,
    actor_type,
    action,
    detail,
    created_at
  )
  select
    row.id,
    row.check_id,
    row.actor_type,
    row.action,
    row.detail,
    row.created_at
  from jsonb_to_recordset(coalesce(p_audit_logs, '[]'::jsonb)) as row(
    id uuid,
    check_id uuid,
    actor_type text,
    action text,
    detail text,
    created_at timestamptz
  );

  insert into public.abuse_events (
    id,
    route,
    reason,
    fingerprint_hash,
    created_at
  )
  select
    row.id,
    row.route,
    row.reason,
    row.fingerprint_hash,
    row.created_at
  from jsonb_to_recordset(coalesce(p_abuse_events, '[]'::jsonb)) as row(
    id uuid,
    route text,
    reason text,
    fingerprint_hash text,
    created_at timestamptz
  );
end;
$$;

revoke all on function public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

create policy "profiles owner can read"
on public.profiles for select
to authenticated
using (id = auth.uid() and deleted_at is null);

create policy "profiles owner can update"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "owners can read their comfort checks"
on public.comfort_checks for select
to authenticated
using (owner_user_id = auth.uid()::text and deleted_at is null);

-- Direct owner updates to comfort_checks are intentionally not granted. Plan,
-- status, token-hash, retention, draft, and theme mutations must go through
-- server-mediated routes/functions that enforce purchase state, status
-- transitions, validation, and audit logging.

create policy "owners can read redacted purchase rows"
on public.purchases for select
to authenticated
using (owner_user_id = auth.uid()::text);

-- No anonymous table policies are defined. Guest, host-token, response-token,
-- result-token, analytics, audit, abuse, and admin paths must go through API
-- routes or Supabase Edge Functions that validate hashed tokens and rate limits.
-- This prevents anon clients with the publishable key from listing tables or
-- reading private responses directly.
--
-- The Supabase runtime persists rows in the normalized tables above. Server
-- routes use hashed bearer/link tokens for public token flows, while direct
-- browser clients with the publishable key remain constrained by these RLS
-- policies and cannot list private responses, purchases, audit logs, or abuse
-- events.
