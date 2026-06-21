# Operations

## Local admin route

Set `SAYABLE_ADMIN_TOKEN` in `.env.local`, then call:

```bash
curl -H "x-sayable-admin-token: $SAYABLE_ADMIN_TOKEN" http://localhost:3000/api/admin
```

The route returns redacted recent checks, purchases, abuse events, audit logs, and analytics events.
It also returns recent responses with only check id, status, tier id, constraint count, timestamps, and deletion state;
private notes and response tokens are never included.

To close or delete a problematic check:

```bash
curl -X POST http://localhost:3000/api/admin \
  -H "content-type: application/json" \
  -H "x-sayable-admin-token: $SAYABLE_ADMIN_TOKEN" \
  -d '{"checkId":"CHECK_ID_FROM_ADMIN_SNAPSHOT","action":"close"}'
```

Admin actions are audit logged. If a host token is already available from a support exchange, `hostToken` may be used
instead of `checkId`, but operators should normally use the redacted `checkId` returned by `GET /api/admin`.

## Supabase dashboard SQL

Recent checks:

```sql
select id, title, activity_type, plan, status, owner_user_id, created_at, updated_at
from public.comfort_checks
order by created_at desc
limit 50;
```

Recent responses without notes:

```sql
select check_id, status, tier_id, cardinality(constraint_ids) as constraint_count, created_at, deleted_at
from public.responses
order by created_at desc
limit 100;
```

Mock purchases:

```sql
select check_id, product_type, amount_cents, mode, status, created_at
from public.purchases
order by created_at desc
limit 50;
```

Funnel health:

```sql
select event_name, count(*) as events
from public.analytics_events
where created_at > now() - interval '7 days'
group by event_name
order by events desc;
```

Recent errors and abuse:

```sql
select context->>'route' as route, context->>'method' as method, context->>'status' as status, count(*) as hits, max(created_at) as latest
from public.analytics_events
where event_name = 'error_shown'
  and created_at > now() - interval '24 hours'
group by route, method, status
order by latest desc;

select route, reason, count(*) as hits, max(created_at) as latest
from public.abuse_events
where created_at > now() - interval '24 hours'
group by route, reason
order by latest desc;
```

## Production scalability follow-ups (recommended)

These are pre-existing MVP architecture items surfaced by hardening review. They only
bite under `SAYABLE_STORE_BACKEND=supabase` (the file backend used for local smoke is
unaffected) and are deliberately deferred — see the `docs/security-privacy.md` note that
hot paths should move to row-level transactional operations.

- **Whole-store reads on hot paths.** `readSupabaseStore` reads all rows of all 7 tables
  per request; every token lookup is an in-memory `.find`, so the token-hash indexes are
  never used. Add row-level filtered queries (`from('comfort_checks').eq('host_token_hash', h)`
  + the check's responses by `check_id`) for `getPublicCheck/getHostCheck/getOwnerCheck/
  getSnapshot/getPreviewByToken`; keep the whole-store read only for the admin snapshot.
- **Whole-store rewrite per mutation.** Every write (including each analytics/audit/abuse
  row and the per-pageview `web_opened` beacon) routes through `replace_sayable_runtime_store`,
  which DELETEs + re-INSERTs all tables under one global advisory lock. Move mutations to
  row-level inserts/updates and append-only logging to a dedicated row insert.
- **Global write lock.** `SUPABASE_STORE_LOCK_KEY` is a single constant, serializing all
  writes app-wide. Once mutations are row-level, drop it (rely on Postgres row locks) or
  scope it per check (`sayable:check:${checkId}`).
- **Redundant indexes.** `comfort_checks_guest/host/result_token_idx` and `responses_token_idx`
  duplicate the UNIQUE-constraint backing indexes; drop them in a new migration
  (`drop index if exists ...`) to cut write-time index maintenance.

### Minor UI follow-ups (LOW)

- Server-seed `initialData` for the host **review** token route (`/checks/[hostToken]/review`),
  mirroring the `/h/[hostToken]` results seed, to remove its first-paint loading flash. The
  auth-gated `/dashboard/checks/[checkId]/review` variant should keep client fetch.

