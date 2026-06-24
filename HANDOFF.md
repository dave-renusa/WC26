# WC26 — Session Handoff

Last updated: 2026-06-24. Read this first if you're a fresh thread picking up the WC26 bracket-pool app.

## What this is
A World Cup 2026 bracket-pool web app. **Next.js 16 (App Router) + Supabase + Vercel.**
- ⚠️ **Read `AGENTS.md` first** — this Next.js has breaking changes vs training data; consult `node_modules/next/dist/docs/` before writing Next-specific code.
- Repo: `dave-renusa/WC26` (GitHub). Production deploys from **`main`** to the Vercel project **`wc26`** (on the **RenUSA** Vercel account → live at `wc26-nine.vercel.app`).
- Supabase project: `https://upjphwesbdnlhgrrcofy.supabase.co`.
- Dev branch in use: `claude/third-place-golden-boot-picks-y46hct` (kept in sync with `main`).

## Deploy / workflow reality
- **Push to `main` → production deploy.** Push to a branch → **preview** deploy.
- **Preview auth gotcha:** previews run on a different domain, so the Supabase login session doesn't carry over and auth-gated pages (`/picks`, `/bracket`) bounce you. To review auth-gated changes, either log into the preview domain via magic link, or just ship to `main` and review on the live site (the owner is logged in there).
- **Migrations are NOT applied by deploy.** Any new `supabase/migrations/*.sql` must be run **manually** in the Supabase SQL editor (`/dashboard/project/upjphwesbdnlhgrrcofy/sql/new`) or via `supabase db push`.
- **Git write access has been flaky.** Mid-session the sandbox lost write perms (HTTP 403 on push, and the GitHub MCP returned "Resource not accessible by integration"). Fix was the user reconnecting GitHub / the Claude app write permission on the `dave-renusa` account. If pushes 403 again: have the user re-auth; reads still work.
- **Sandbox can't reach ESPN.** `site.api.espn.com` and `www.espn.com` are NOT on the sandbox network allowlist (curl → "Host not in allowlist"; WebFetch → 403). The **deployed app on Vercel CAN** reach ESPN — that's why the sync works in prod but not from here. Don't try to fetch ESPN from the sandbox.
- Build/verify locally with: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy bun run build` (and `npx tsc --noEmit`).
- Commits must be authored `Claude <noreply@anthropic.com>` (a stop-hook checks this). No signing key in the sandbox, so commits show "Unverified" until they land through GitHub — that's expected and only resolves on push.

## Manual steps — status
1. ✅ **DONE** — Migration `007_bracket_picks_open.sql` has been applied (adds `tournament_settings.bracket_picks_open`). Migration `006_knockout_scoring.sql` was also already applied.
2. ✅ **DONE** — Sample R32 teams cleared (and test knockout picks deleted). The bracket now shows real "TBD" slots; real ESPN teams will populate after the group stage.
3. ⏳ **TODO when ready to let people pick** (after real R32 teams load): `/admin` → check **"Bracket picks open"** → Save. Until then the bracket is intentionally read-only for everyone.

## What's been built (recent work)
- **Group picks lock per-match** at each game's kickoff (not all at once). 3rd-place + Golden Boot lock at the first kickoff.
- **Knockout scoring** (migration 006): R32=1, R16=3, QF=5, SF=8, Final=13 (group=1, 0.5 for group draws).
- **+5 "third-place upset" bonus**, fully automatic: `v_group_standings` computes each team's group finish from results; `v_third_place_winner_bonuses` awards +5 per knockout game where a player correctly picked a 3rd-place qualifier to win. Folded into leaderboard `bonus_points`. Admin can override a finish via `teams.actual_finish`.
- **Final tiebreaker input** (total goals in the Final) — built into the bracket picker, saved to `bonus_picks.predicted_final_total_goals`.
- **`/bracket` is its own page** (nav link added), moved out of `/picks`. `/picks` = group games + 3rd-place + Golden Boot only.
- **Bracket is always visible but read-only** until `tournament_settings.bracket_picks_open` is flipped on (migration 007). Preview/locked banner; empty slots show "TBD". First-R32-kickoff lock still freezes picks at kickoff.
- **Desktop bracket = centered NCAA-style tree** (recursive, built from `team_a/b_from_match_id` wiring; left half = subtree at SF#1, right half = SF#2, Final center). Mobile = stacked rounds. Connector CSS in `globals.css` (`.bk-conn*`, `.bk-line`). *Connector alignment was a blind build — may need visual tuning.*
- **Auto-derived deadline:** home + rules pages show the bracket lock time from the real first-R32 kickoff via `src/lib/format.ts` `formatEtDeadline()`. Auto-corrects when ESPN sets the real time. (Seed shows Sun Jun 28 ~12pm ET; real time unverified — see below.)
- **Auto-open:** the ESPN sync (`src/lib/sync/sync-matches.ts` → `maybeAutoOpenBracket`) sets all knockout lock times to the first R32 kickoff once R32 teams are populated. Note: this only fills EMPTY R32 slots, so sample data blocks it (hence step 2 above).

## How results/bracket stay live (automated)
- **GitHub Actions `.github/workflows/sync-matches.yml`** POSTs `/api/sync/matches?apply=1` **every 10 minutes** during match windows (needs repo secret `CRON_SECRET`). This pulls ESPN results AND populates the real R32 teams + opens/locks the bracket automatically once ESPN publishes the matchups. So no manual daily check is needed.
- Admin can also manually **Dry-run / Apply sync / Open bracket** in `/admin`.

## Open questions / known issues
- **First R32 kickoff time unverified.** Seed says Sun Jun 28 16:00 UTC (= 12pm ET); the user thought 3pm ET; web sources were inconsistent. It now auto-derives from the DB and will self-correct when ESPN populates the real time — so no hardcoded guess remains, but the displayed time may shift once real data lands.
- **Connector-line alignment** on the desktop bracket tree may need tuning (built without visual iteration).
- As of 2026-06-24 the group stage is NOT finished (final group games still `STATUS_SCHEDULED`), so real R32 matchups don't exist yet — the bracket will populate around June 27–28.

## Key files
- Scoring: `supabase/migrations/{002_views,003_draw_scoring,006_knockout_scoring}.sql`
- Bracket open toggle: `supabase/migrations/007_bracket_picks_open.sql`
- Bracket UI: `src/app/bracket/page.tsx`, `src/app/picks/bracket-picker.tsx`
- Picks (group): `src/app/picks/page.tsx`, `src/app/picks/picks-form.tsx`
- Scoring/leaderboard: `src/app/leaderboard/page.tsx`, views above
- Admin: `src/app/admin/{page.tsx,admin-console.tsx}`, `src/app/api/admin/*`, `src/lib/admin/guard.ts`
- ESPN sync: `src/lib/sync/{espn,resolve,sync-matches}.ts`, `src/app/api/sync/matches/route.ts`, `.github/workflows/sync-matches.yml`
- Shared: `src/lib/types.ts`, `src/lib/format.ts`, `src/app/layout.tsx` (nav), `src/app/globals.css`
- Home/rules copy: `src/app/page.tsx`, `src/app/rules/page.tsx`

## Current git state
- `main` and `claude/third-place-golden-boot-picks-y46hct` both at the same tip (latest: "Bracket: always-visible read-only preview + auto-derived deadline"). Production is deploying that.
