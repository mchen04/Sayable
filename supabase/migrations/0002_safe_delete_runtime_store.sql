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
