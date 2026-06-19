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
  owner_user_id uuid references auth.users(id) on delete set null,
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
  expires_at timestamptz not null,
  final_shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.comfort_tiers (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.comfort_checks(id) on delete cascade,
  tier_key text not null,
  label text not null,
  description text not null,
  score numeric not null check (score >= 0 and score <= 3),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (check_id, tier_key)
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
  owner_user_id uuid references auth.users(id) on delete set null,
  product_type text not null check (product_type = 'premium_check_upgrade'),
  amount_cents integer not null check (amount_cents = 499),
  mode text not null check (mode in ('mock', 'test')),
  status text not null check (status in ('started', 'completed', 'failed', 'cancelled')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saved_groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.comfort_checks(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.comfort_checks(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
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

create trigger saved_groups_set_updated_at
before update on public.saved_groups
for each row execute function public.set_updated_at();

create trigger sayable_store_locks_set_updated_at
before update on public.sayable_store_locks
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.comfort_checks enable row level security;
alter table public.comfort_tiers enable row level security;
alter table public.responses enable row level security;
alter table public.result_snapshots enable row level security;
alter table public.purchases enable row level security;
alter table public.saved_groups enable row level security;
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
using (owner_user_id = auth.uid() and deleted_at is null);

-- Direct owner updates to comfort_checks are intentionally not granted. Plan,
-- status, token-hash, retention, draft, and theme mutations must go through
-- server-mediated routes/functions that enforce purchase state, status
-- transitions, validation, and audit logging.

create policy "owners can read their tiers"
on public.comfort_tiers for select
to authenticated
using (
  exists (
    select 1 from public.comfort_checks cc
    where cc.id = comfort_tiers.check_id
      and cc.owner_user_id = auth.uid()
      and cc.deleted_at is null
  )
);

create policy "owners can read redacted purchase rows"
on public.purchases for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owners can read saved groups"
on public.saved_groups for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owners can insert saved groups"
on public.saved_groups for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "owners can update saved groups"
on public.saved_groups for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

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
