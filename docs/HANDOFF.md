# Hearsay — Session Handoff
*Start any new development session from this doc + docs/hearsay-vision.md.*

## Project state (2026-07-16, second session — first code)
- **Live at https://riantrost.github.io/Hearsay/** — deployed via GitHub Actions from `main` (`.github/workflows/pages.yml`); repo is public so the table can open the link with no login. Any push to `main` touching `app/` auto-redeploys.
- **Prototype built: a portable, local-first PWA in [`app/`](../app/).** Buildless (static files, vanilla ES modules, no framework/bundler). The full core loop the vision names as load-bearing works end to end: map-as-browse-surface with pan/pinch-zoom, owner-dropped session-bound event pins carrying per-player *open jacks*, immutable per-seat testimony, the living warband page snapshotted by session, the **session scrubber** replaying the map's growth, and fog v1 (hidden pins + reveal-as-timeline-event). Identity-first seat picker, per-device. Data in IndexedDB; portable `.hearsay.json` export/import as the offline stand-in. Run/architecture notes in [`app/README.md`](../app/README.md).
- **Sync rung built (off by default).** Optional Supabase layer: publish a campaign to the cloud, join by 6-char code, live updates across the table — while staying a static PWA (anon key + row-level security, no server to host). The canon/testimony split, fog, and sealing are enforced as Postgres RLS in [`supabase/schema.sql`](../supabase/schema.sql); anonymous auth + join code is the identity model; SDK is vendored (`app/vendor/`) to stay buildless. Client surface is [`app/js/sync.js`](../app/js/sync.js), gated behind `app/config.js` (blank = pure local mode). **Not yet live-tested** — needs a Supabase project provisioned + the two config values pasted (checklist: [`supabase/README.md`](../supabase/README.md)). Publish/join/claim/realtime paths and the id-remapping are written and the pure logic is unit-verified in-browser; end-to-end against a real project is the next step. Architecture pinned in decisions.md.
- **Verified with a headless-browser driver** (create → upload map → drop pin → write testimony → scrub): full flow runs clean (no console errors), and the scrubber/fog visibility rules pass explicit assertions (future pins hidden from all; staged pins hidden from players even in the past; owner sees staged). One real bug caught and fixed along the way: the viewport captured the pointer on every `pointerdown`, which swallowed pin taps — fixed by not capturing when the target is an interactive child.
- **Concept designed (first session, 2026-07-16).** Full concept in [hearsay-vision.md](hearsay-vision.md); settled forks pinned in [decisions.md](decisions.md) — canon/testimony split, fog-as-disclosure tiers, grid-as-reference (hex/square/freeform), the living warband page, conclusion-by-GM-act-only (no mortality clock), and now the local-first-prototype scope fork.
- **Moved out of Fragments' docs into this folder (2026-07-16).** Hearsay shares the family mission (protect the ritual of play) and conventions but no code or product decisions with Fragments; its forks pin here, never to Fragments' decisions file.

## Deferred (not refused)
- **Live-testing the sync rung** — provision Supabase + paste config, then drive publish→join→two-device live update end to end; fix anything the real API surfaces (realtime framing, anon-auth endpoint, storage RLS are the likeliest rough spots).
- **Sync polish** — a device's own writes echo back through realtime (one extra refetch); offline write-queuing for cloud campaigns; smoother-than-full-rerender live apply.
- **No painted fog, no map-grows-at-the-edges, no archive-shelf polish** — all in the vision, none needed to answer the validation question.
- **Grid overlay** draws square/hex for reference but pins don't snap to it yet.

## Next candidates (not yet forks)
1. **The pre-build validation test:** run Rian's Frostgrave campaign for 3–4 sessions on a shared image + numbered pins + a doc per player. The hypothesis everything hinges on: players write testimony unnagged. This gates the build, per decisions.md's validation paragraph.
2. **Prototype scope sketch** once the test signals: the map viewport (an image + normalized-coordinate pins + pan/zoom — Fragments' `src/tree/viewport.ts` gestures are the same interaction), the pin/slot data model, and the session scrubber — named in the vision doc as the single most important interaction to get right.

## Open design questions (from the vision doc)
- Painted fog: v1 or first post-validation feature? (Hidden pins are v1 either way.)
- Warband snapshot granularity — leaning on-edit with a session stamp.
- Competitive sealing ("sealed until both sides have written") — let the Frostgrave test answer it.
- The archive shelf: concluded campaigns as pin-dense map thumbnails (identity-is-the-shape), not yet designed.

## Principles (bind all future work)
Plural memory is the artifact · canon/testimony split, authority by layer · identity-first, table-private · the map is the browse surface · sessions are the clock · every system must survive a low-energy month.
