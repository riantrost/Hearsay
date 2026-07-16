# Hearsay sync — Supabase setup

The app is local-first and works with no backend. This turns on the **sync rung**: publish
a campaign to the cloud, join by code, and see the table's changes live. One-time setup,
~5 minutes. Nothing here costs money on Supabase's free tier for a table-sized campaign.

## 1. Create the project
1. Sign in at [supabase.com](https://supabase.com) → **New project**. Pick a name and a
   strong database password (you won't need it for the app).
2. Wait for it to finish provisioning.

## 2. Run the schema
1. In the project: **SQL Editor → New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and **Run**.
   It creates the tables, the row-level-security policies that enforce the canon/testimony
   split, the join/claim/publish functions, realtime, and the `maps` storage bucket.

## 3. Turn on anonymous sign-in
Every device gets a stable identity with no email. Enable it:
- **Authentication → Sign In / Providers → Anonymous sign-ins → Enable**. Save.

## 4. Give the app its two values
- **Project Settings → API**. Copy the **Project URL** and the **anon / publishable** key.
- Put them in [`app/config.js`](../app/config.js):

  ```js
  export const SUPABASE_URL = 'https://YOURPROJECT.supabase.co';
  export const SUPABASE_ANON_KEY = 'eyJ...the anon key...';
  ```
- Commit + push to `main`. The Pages workflow redeploys automatically.

> The anon key is **meant** to be public — it grants nothing on its own. Every read and
> write is gated by the row-level-security policies in `schema.sql`, so a person holding
> this key can do exactly what a table member could, and no more.

## 5. Use it
- **Owner:** open a campaign → menu → **Publish to cloud** → share the 6-character **join
  code**.
- **Players:** home screen → **Join a campaign…** → enter the code → pick a seat.
- From then on, pins, testimony, warbands, reveals, and the session clock sync live.

## Notes & limits (prototype)
- **Conflict handling is last-write-wins** per field. The data partitions by owner/author,
  so real collisions are rare; a proper merge is a later luxury.
- **A device's own edits echo back** through realtime (one extra refetch). Harmless, just
  a little chatty — a self-filter is a easy later optimization.
- **Map images** live in the private `maps` bucket at `<campaign_id>/map`, readable by
  members, writable by the owner.
- To rotate the vendored SDK, see [`app/vendor/README.md`](../app/vendor/README.md).
