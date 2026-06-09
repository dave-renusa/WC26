# WC26 — 2026 World Cup Bracket Pool

Private bracket challenge for friends & family. Next.js 16 + Supabase + Vercel.

## Dev

```bash
bun install
bun dev
```

Open http://localhost:3000.

## Environment

Copy `.env.local.example` → `.env.local` and fill in:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (already set) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Used by `/api/sync/matches` to update results past RLS. |
| `CRON_SECRET` | Shared secret for the sync endpoint (header `x-sync-secret`). |

Same values must be set in Vercel project env for prod.

## Live results sync

`POST /api/sync/matches` pulls the latest ESPN scoreboard for `fifa.world` and
updates `matches.score_a`, `matches.score_b`, and `matches.winner_team_id` for
any group-stage match ESPN has marked final.

### Auth (either works)
- HTTP header `x-sync-secret: <CRON_SECRET>` — for cron and curl.
- Signed-in user with `profiles.is_admin = true` — for the in-app admin button.

### Query params
- `apply=1` — actually write changes. Without it, runs in **dry-run** mode.
- `start=YYYY-MM-DD`, `end=YYYY-MM-DD` — UTC date range. Defaults to today ±.

### Safety rules baked into the sync
1. Only acts on events ESPN reports as completed (`status.type.state === "post"` and `completed === true`).
2. Only updates matches whose `team_a_id` and `team_b_id` are already set — knockouts before the bracket is filled are ignored.
3. If admin has manually set a different `winner_team_id`, the sync logs a `conflict` and leaves the row alone. Admin always wins.
4. Idempotent: re-running on a finalized match logs `noop`.
5. Every decision is recorded in `match_sync_log` for forensics.

### Verifying it's safe (do this once before turning on cron)
1. Run a dry-run: `curl -X POST -H "x-sync-secret: $CRON_SECRET" "$URL/api/sync/matches"`.
2. Read the `entries[]` in the response — confirm `planned` / `noop` / `skipped` look right.
3. Inspect the `match_sync_log` table for the dry-run rows.
4. Once happy, repeat with `?apply=1` after at least one match has finished.

### Cron (not yet enabled)
Add to `vercel.json` after live verification:

```json
{
  "crons": [
    { "path": "/api/sync/matches?apply=1", "schedule": "*/10 * * * *" }
  ]
}
```

Vercel auto-attaches `x-vercel-cron` and we'll add a check for that alongside
`CRON_SECRET` before enabling.

## Migrations

Apply in order from `supabase/migrations/`:
- `001_init.sql` — schema, RLS, profile trigger.
- `002_views.sql` — initial scoring views.
- `003_draw_scoring.sql` — 0.5 pts for picking either team in a drawn group game.
- `004_sync.sql` — `match_sync_log` audit table.

Then seed: `supabase/seed/01_teams.sql`, `supabase/seed/02_matches.sql`.
