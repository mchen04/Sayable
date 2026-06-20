drop policy if exists "owners can read their comfort checks" on public.comfort_checks;
drop policy if exists "owners can read redacted purchase rows" on public.purchases;

alter table public.comfort_checks drop constraint if exists comfort_checks_owner_user_id_fkey;
alter table public.purchases drop constraint if exists purchases_owner_user_id_fkey;
alter table public.analytics_events drop constraint if exists analytics_events_owner_user_id_fkey;
alter table public.audit_logs drop constraint if exists audit_logs_owner_user_id_fkey;

alter table public.comfort_checks alter column owner_user_id type text using owner_user_id::text;
alter table public.purchases alter column owner_user_id type text using owner_user_id::text;
alter table public.analytics_events alter column owner_user_id type text using owner_user_id::text;
alter table public.audit_logs alter column owner_user_id type text using owner_user_id::text;

do $$
declare
  function_sql text;
begin
  function_sql := pg_get_functiondef(
    'public.replace_sayable_runtime_store(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  function_sql := replace(function_sql, 'owner_user_id uuid', 'owner_user_id text');
  execute function_sql;
end;
$$;

revoke all on function public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

create policy "owners can read their comfort checks"
on public.comfort_checks for select
to authenticated
using (owner_user_id = auth.uid()::text and deleted_at is null);

create policy "owners can read redacted purchase rows"
on public.purchases for select
to authenticated
using (owner_user_id = auth.uid()::text);
