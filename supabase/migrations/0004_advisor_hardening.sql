-- Supabase database advisor hardening.
--
-- Fixes raised by `supabase db advisors`:
--   SECURITY  function_search_path_mutable  (set_updated_at, try_acquire_sayable_store_lock, release_sayable_store_lock)
--   PERFORMANCE auth_rls_initplan           (profiles x2, comfort_checks, purchases)
--
-- 1) Pin a non-mutable, empty search_path on the remaining helper/trigger functions.
--    All object references inside these functions are already schema-qualified
--    (public.*) or resolve from pg_catalog (now(), make_interval()), so an empty
--    search_path is safe and removes the role-mutable search_path attack surface.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.try_acquire_sayable_store_lock(
  p_lock_key text,
  p_owner_id text,
  p_ttl_seconds integer default 20
)
returns boolean
language plpgsql
set search_path = ''
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
set search_path = ''
as $$
begin
  update public.sayable_store_locks
  set locked_until = now()
  where lock_key = p_lock_key
    and owner_id = p_owner_id;
end;
$$;

-- Re-assert least-privilege grants after replacing the functions.
revoke all on function public.set_updated_at() from public;
revoke all on function public.try_acquire_sayable_store_lock(text, text, integer) from public, anon, authenticated;
grant execute on function public.try_acquire_sayable_store_lock(text, text, integer) to service_role;
revoke all on function public.release_sayable_store_lock(text, text) from public, anon, authenticated;
grant execute on function public.release_sayable_store_lock(text, text) to service_role;

-- 2) Wrap auth.uid() in a scalar subselect so Postgres evaluates it once per
--    statement (initplan) instead of once per row. Identical semantics, faster
--    at scale. Recreate all four flagged policies.

drop policy if exists "profiles owner can read" on public.profiles;
create policy "profiles owner can read"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) and deleted_at is null);

drop policy if exists "profiles owner can update" on public.profiles;
create policy "profiles owner can update"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "owners can read their comfort checks" on public.comfort_checks;
create policy "owners can read their comfort checks"
on public.comfort_checks for select
to authenticated
using (owner_user_id = (select auth.uid())::text and deleted_at is null);

drop policy if exists "owners can read redacted purchase rows" on public.purchases;
create policy "owners can read redacted purchase rows"
on public.purchases for select
to authenticated
using (owner_user_id = (select auth.uid())::text);
