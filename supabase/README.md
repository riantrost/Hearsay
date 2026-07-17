# Hearsay table server (Supabase)

One Supabase project = one table server. Any number of campaigns can live on it;
each is invite-only and row-secured by seat.

## One-time setup

1. Create a Supabase project (free tier is plenty for a table).
2. In the SQL editor, run [`schema.sql`](schema.sql).
3. In **Authentication → Sign In / Up**, enable **Anonymous sign-ins**.
   (Devices are anonymous users — no emails, no accounts. Identity stays a
   per-device, table-private choice, exactly like the local app.)

That's the whole setup. In the app, the owner opens their campaign →
menu → **Publish to table…** and pastes the project URL + anon key
(Settings → API). Everyone else pastes the resulting one-line invite under
**Join a table…** on the home screen.

## What the rows enforce (not the client)

- Canon (campaign facts, the roster, event pins) writes: **owner seat only**.
- A **hidden** pin's row never reaches a player's device at all.
- Testimony writes: **only the seat that owns the words**, only into an open
  slot. The owner can read everything and edit nothing.
- Sealed testimony (`until-conclusion`): other players get fill-state
  (that words exist) but never the words, until the campaign concludes.
- Pending pin proposals are visible to **proposer + owner only**; only the
  owner decides them. (Schema + policies ready; app UI is the next rung.)

## The contract suite

[`test/run.sh`](test/run.sh) applies the schema to a scratch database on a
local Postgres (a tiny stub stands in for the Supabase environment) and runs
[`test/rls-tests.sql`](test/rls-tests.sql) — 27 assertions, each one a product
rule from `docs/decisions.md`. Run it after any schema change:

```sh
sudo -u postgres ./test/run.sh
# … NOTICE: ALL RLS ASSERTIONS PASSED
```
