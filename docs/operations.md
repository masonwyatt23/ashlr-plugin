# Operations Runbook — ashlr-server

This document covers monitoring, alerting, and incident response for the ashlr pro backend.

---

## What to Monitor

### Health Endpoints

| Endpoint | Purpose | Expected |
|----------|---------|---------|
| `GET /healthz` | Liveness — is the process alive? | 200 always |
| `GET /readyz` | Readiness — is SQLite reachable? | 200 in normal operation |

Configure your uptime monitor (e.g. Fly.io checks, Better Uptime, Checkly) to hit `/readyz` every 15–30 seconds with a 5-second timeout. Alert on 2+ consecutive failures.

### Prometheus Metrics

Scrape `GET /metrics` (Basic Auth or IP allowlist required). Key metrics to dashboard:

#### Request Traffic
```
# Total request rate
rate(ashlr_http_requests_total[5m])

# Error rate (5xx)
rate(ashlr_http_requests_total{status=~"5.."}[5m])

# p95 latency
histogram_quantile(0.95, rate(ashlr_http_request_duration_seconds_bucket[5m]))
```

#### Business Metrics
```
ashlr_users_total                    # total registered users
ashlr_subscriptions_active           # paying customers right now
ashlr_stats_uploads_total            # plugin upload volume
rate(ashlr_magic_links_sent_total[1h]) # sign-up velocity
rate(ashlr_llm_requests_total[5m])   # LLM usage by tier
```

#### LLM Token Spend
```
histogram_quantile(0.95, rate(ashlr_llm_request_tokens_bucket{type="input"}[5m]))
```

### Logs

All logs are structured JSON on stdout. Use your platform's log aggregator (Fly.io → `fly logs`, Datadog, Loki, etc.).

**Key log fields to alert on:**
- `level: "error"` — unexpected server errors
- `status: 502` — Anthropic API failures
- `status: 429` on `/llm/summarize` at high rate — rate-limit flood

**PII note:** `authorization`, `cookie`, `email`, `text`, `systemPrompt` are always `[REDACTED]` in logs.

---

## Alert Thresholds (Recommended)

| Alert | Condition | Severity |
|-------|-----------|---------|
| DB down | `/readyz` returns non-200 for 2+ checks | Critical |
| High error rate | 5xx rate > 1% of requests over 5m | Warning |
| LLM unavailable | `/llm/summarize` returning 502 > 5 times / minute | Warning |
| Stripe webhook lag | No `billing/webhook` calls in 2h during business hours | Info |
| Rate-limit flood | `status=429` > 50/min on any single path | Warning |

---

## Runbooks

### DB Down (`/readyz` returning 503)

**Symptoms:** `/readyz` returns `{ "db": "error" }`. Authenticated routes returning 500.

**Likely causes:**
1. SQLite file on a volume that wasn't mounted (Fly.io machine restart without persistent volume).
2. Disk full on the volume.
3. WAL corruption from an unclean shutdown.

**Steps:**
1. `fly ssh console -a ashlr-api` → check `df -h /data` for disk space.
2. Verify `ASHLR_DB_PATH` points to the mounted volume: `echo $ASHLR_DB_PATH`.
3. If the file exists, try `sqlite3 $ASHLR_DB_PATH "PRAGMA integrity_check;"`.
4. If corrupt: restore from the most recent backup. Backups should be scheduled via `fly volumes snapshots list`.
5. If disk full: delete old WAL files or scale up the volume.

### Anthropic API Failure (502 on `/llm/summarize`)

**Symptoms:** LLM route returning 502. Sentry shows `Service temporarily unavailable` errors.

**Steps:**
1. Check [status.anthropic.com](https://status.anthropic.com) for an active incident.
2. Verify `ANTHROPIC_API_KEY` is still valid: `fly secrets list`.
3. If key rotated, update: `fly secrets set ANTHROPIC_API_KEY=sk-ant-...`.
4. Check if the error is transient — a retry after 60 seconds often resolves API blips.
5. If the Anthropic outage is prolonged, consider returning a user-friendly degraded-mode message and disabling the LLM route via a feature flag.

### Stripe Webhook Lag

**Symptoms:** Subscriptions not updating after payments. Billing status stale.

**Steps:**
1. In Stripe Dashboard → Developers → Webhooks → select the endpoint → view recent deliveries.
2. Look for failed deliveries (non-2xx responses from `/billing/webhook`).
3. If the server was down, Stripe retries automatically for up to 3 days — re-deliveries will self-heal.
4. If `STRIPE_WEBHOOK_SECRET` was rotated, update: `fly secrets set STRIPE_WEBHOOK_SECRET=whsec_...`.
5. For persistent failures, check Sentry for errors in the webhook handler and review the server logs around the timestamp of failed deliveries.

### Rate-Limit Flood

**Symptoms:** Spike in 429 responses. Possibly automated abuse of `/auth/send` or `/llm/summarize`.

**Steps:**
1. Check logs for the offending IP or user ID pattern:
   ```
   fly logs | grep '"status":429' | head -50
   ```
2. `/auth/send` is rate-limited per email (5/hour). A flood suggests credential stuffing — no immediate action needed if email enumeration is not exposed (it isn't — the endpoint always returns `{ sent: true }`).
3. `/llm/summarize` is rate-limited per API token (30/min). If a single user is flooding, you can revoke their token in the DB:
   ```sql
   DELETE FROM api_tokens WHERE user_id = '<uid>';
   ```
4. If a bot is probing unauthenticated endpoints, add their IP to a Fly.io firewall rule.

### Sentry Error Spike

**Symptoms:** Sentry alert for high error volume.

**Steps:**
1. Check the Sentry issue for the stack trace and `requestId`.
2. Correlate `requestId` to server logs for full context.
3. Check if the error is tied to a recent deploy: `fly releases`.
4. If a bad deploy: `fly deploy --image <previous-image>` to roll back.

---

## Deployment Checklist

Before deploying to production:

- [ ] `cd server && bun test` passes
- [ ] `cd site && bun run build` passes
- [ ] `SENTRY_DSN` is set in Fly secrets
- [ ] `ANTHROPIC_API_KEY` is valid
- [ ] Stripe webhook endpoint is registered and `STRIPE_WEBHOOK_SECRET` matches
- [ ] `/readyz` returns 200 after deploy

---

## Useful Commands

```bash
# Tail live logs
fly logs -a ashlr-api

# SSH into machine
fly ssh console -a ashlr-api

# List secrets (names only, not values)
fly secrets list -a ashlr-api

# View recent deploys
fly releases -a ashlr-api

# Scale memory if OOM
fly scale memory 512 -a ashlr-api

# Prometheus scrape (local test)
curl -u prometheus:secret https://api.ashlr.ai/metrics
```
