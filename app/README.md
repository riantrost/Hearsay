# Hearsay — prototype PWA

A portable, local-first Progressive Web App for the plural-memory campaign record.
Buildless: static files, vanilla ES modules, no framework, no bundler. The whole
point of this stage is to **bypass the spreadsheet** for a real table (the Frostgrave
validation campaign) while staying honest about what a prototype is.

## Run it

Any static server over `localhost` (a service worker needs a secure context, and
`localhost` counts):

```bash
cd app
python3 -m http.server 8842
# open http://localhost:8842
```

To install it as an app on a phone, host the `app/` directory over HTTPS (GitHub
Pages works — point Pages at this folder or copy it to the site root) and use the
browser's *Add to Home Screen*. It then opens standalone and works offline.

## What's here

The core loop the vision names as load-bearing, end to end:

- **The map is the browse surface.** Upload any image (art, scanned source, a photo
  of a napkin). Pan / pinch-zoom. Pins sit at normalized coordinates so they ride
  the image at any zoom.
- **Pins are session-bound events carrying open jacks.** The owner drops a pin
  (canon geography stays in one pair of hands); each attached player gets a journal
  slot — an *open jack*, a visible invitation that never nags. A pin's ring fills as
  testimony arrives; the badge reads `filled/total`.
- **Testimony is the players' layer.** Each seat writes its own entry, immutable by
  anyone else. Owner never edits words — only placement and visibility. Sealing
  (open by default, or sealed until conclusion) is a campaign setting.
- **The warband page is a living document.** Freely edited by its author, snapshotted
  under a session stamp so the scrubber remembers who you were.
- **Sessions are the clock.** No calendar. The **session scrubber** replays the map's
  growth — drag back and watch pins vanish into the future they haven't reached yet.
- **Fog v1 = hidden pins.** The owner can stage a pin invisibly and *reveal* it later;
  the reveal itself lands in the timeline. (Painted fog is deliberately not here yet.)
- **Identity-first, table-private.** "Which seat is this device?" is a local choice,
  not an account. No sign-up, no discovery.
- **A table server, when the table wants one.** The owner publishes a campaign to a
  Supabase project ([`../supabase/`](../supabase/)) and hands the table a one-line
  invite; each device joins anonymously and claims a seat. Local stays primary —
  the server is where devices meet, syncing on open, on focus, on every local act,
  and on demand. Hidden pins and sealed words are withheld *by the server*, not by
  client politeness.

## Architecture (js/)

| file | responsibility |
|------|----------------|
| `db.js` | the only IndexedDB code — `campaigns` (state JSON) + `images` (blobs) |
| `state.js` | in-memory model, every mutation, autosave, export/import, identity |
| `remote.js` | the only server-speaking code: anonymous auth, PostgREST rows, storage |
| `sync.js` | push-what-this-seat-owns / pull-what-this-seat-may-see, publish/join/claim |
| `viewport.js` | pan / pinch-zoom over the image-pixel "world" |
| `campaign.js` | the map screen: pins, grid overlay, scrubber, top bar |
| `panels.js` | sheets: seat picker, event editor, pin detail, warband, settings |
| `home.js` | the shelf — campaigns as map-thumbnail cards |
| `ui.js` | DOM helpers + the sheet/toast system |
| `util.js` | image picking |
| `app.js` | bootstrap + a two-route hash router + service-worker registration |

State persists in IndexedDB. **Export** writes a portable `.hearsay.json` (map image
inlined) that another device can **import** — the prototype's stand-in for sync.

## What this prototype is *not* yet

Deliberately deferred so the validation test isn't blocked on plumbing:

- **No live push.** Sync happens at the moments a table naturally meets (open, focus,
  act, demand) — no websockets, no presence. Weekly campaigns don't need sub-second
  latency, and polling-at-meeting-points survives a low-energy month.
- **No proposal UI yet.** Player-suggested pins are fully modeled and row-secured in
  the schema; the sheets that surface them are the next rung.
- **No painted fog, no map-grows-at-the-edges, no archive shelf polish.** All named in
  the vision; none required to answer *will players write testimony unnagged?*
- **No accounts, still.** Devices are anonymous users; seats stay a table-private choice.

The refusals hold: not a VTT, no rules content, no wiki, no AI summarization.
