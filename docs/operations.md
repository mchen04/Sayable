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
