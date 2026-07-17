# Hearsay — Session Handoff
*Start any new development session from this doc + docs/hearsay-vision.md.*

## Project state (2026-07-17, fourth session — pre-backend code review)
- **Full review of `app/` ran clean enough to green-light the Supabase rung.** The layering held: `db.js` is the only storage toucher, all mutations go through `state.js`'s function surface (the seam a Supabase adapter slots into), and the visibility rules are pure functions ready to mirror as RLS. Two model-level bugs were fixed before the schema fossilizes into Postgres (both verified end-to-end with a headless driver, 6/6, no console errors):
  1. **A pending save now survives leaving the campaign.** The 250ms save debounce could fire after `closeCampaign()` nulled `current` — throwing on the IndexedDB keyPath and silently dropping a just-written testimony entry. `touch()` now snapshots the campaign it will save, and `loadCampaign`/`closeCampaign` flush the pending save first.
  2. **Un-hiding via the Edit sheet is now a reveal.** Flipping the Fog toggle off in Edit used to leave `revealSession: null`, making the pin retroactively visible since its origin session — the scrubber lied about what players knew when. `updateEvent` stamps `revealSession` on the hidden→visible transition (and clears it on re-staging), matching `revealEvent` semantics.
- **Known bugs surfaced by the review, deliberately not fixed this session** (report-first; none block the backend):
  - **First-run trap:** uploading the map via the empty-state prompt never rebuilds the top bar, so "＋ Pin" doesn't appear until a reload/navigation (`campaign.js` `renderMapDrop` repaints the map but not the chrome). Worth fixing before the Frostgrave test.
  - A hard page reload inside the 250ms debounce still loses the edit (the flush covers in-app navigation only; a `pagehide` flush would close it).
  - Small leaks: replaced map images orphan the old blob in IndexedDB; shelf thumbnail object URLs never revoked; `menuButton` stacks a `document` click listener per rerender. A two-finger tap can fire `onTap` (pinch never increments `_moved`). Import/load never checks the stored `schema` version — add the gate before a second schema exists in the wild.
  - Export bundles include sealed testimony in plaintext — honest locally, but sealing only becomes enforceable server-side. One more argument the backend is correctly next.
- **Port shape settled by the review:** decompose `state.js`'s storage into rows (`pins`, `testimony`, `pin_proposals`), keep its mutation API. Do not sync the whole-state blob — blob-sync makes sealed testimony and owner-only writes unenforceable.

## Project state (2026-07-16, third session — UX pass + backend prep)
- **UX pass on the map surface (this session, shipped on `claude/supabase-ux-feedback-metw3t`).** Two of Rian's usability notes, both verified end-to-end with a headless driver (11/11, no console errors): (1) **pin placement is now deliberate** — the owner arms "＋ Pin" and the next tap places, so ordinary taps only pan/zoom and a mis-tap can't mint canon (was: any near-stationary tap opened the editor); (2) **pins hold a constant, legible screen size at any zoom** via a `--pin-k` counter-scale fed from the viewport transform, plus a dark+light double outline and larger tap target. Both pinned in [decisions.md](decisions.md).
- **Player-suggested pins: model designed, build deferred to Supabase (this session).** A player may *propose* a pin; the owner authors canon from it (adopt-and-edit: acceptance opens the event editor pre-filled). Pending proposals are proposer+owner only. Modeled as a **separate `proposals` axis** (never entangled with `hidden`/fog); accepted events carry `proposedBy` provenance. Shape for the next builder:
  ```
  state.proposals = [{ id, by: playerId, x, y, name, type, note, session,
                       status: 'pending'|'accepted'|'declined', createdAt, decidedAt }]
  ```
  Supabase/RLS target: `pins` = owner-only writes; `pin_proposals` = member owns their own row, owner-only status updates. This is the concrete reason the backend is the next rung — it's the first capability that only becomes real across devices. Fork pinned in [decisions.md](decisions.md).
- **Competitive scan run (this session).** Surveyed VTTs (Owlbear, Foundry, Roll20, Alchemy) and worldkeepers (World Anvil, Kanka, LegendKeeper, Obsidian+Leaflet, Azgaar). Headline: *no surveyed tool centers per-seat testimony* — our thesis is an open lane, and our refusals (single-canon wiki, GM moderation, public/social, combat layer, streak loops) are validated as conscious skips. See "Next candidates" for what it surfaced.
- **Prototype built: a portable, local-first PWA in [`app/`](../app/).** Buildless (static files, vanilla ES modules, no framework/bundler). The full core loop the vision names as load-bearing works end to end: map-as-browse-surface with pan/pinch-zoom, owner-dropped session-bound event pins carrying per-player *open jacks*, immutable per-seat testimony, the living warband page snapshotted by session, the **session scrubber** replaying the map's growth, and fog v1 (hidden pins + reveal-as-timeline-event). Identity-first seat picker, per-device. Data in IndexedDB; portable `.hearsay.json` export/import stands in for sync. Run/architecture notes in [`app/README.md`](../app/README.md).
- **Verified with a headless-browser driver** (create → upload map → drop pin → write testimony → scrub): full flow runs clean (no console errors), and the scrubber/fog visibility rules pass explicit assertions (future pins hidden from all; staged pins hidden from players even in the past; owner sees staged). One real bug caught and fixed along the way: the viewport captured the pointer on every `pointerdown`, which swallowed pin taps — fixed by not capturing when the target is an interactive child.
- **Concept designed (first session, 2026-07-16).** Full concept in [hearsay-vision.md](hearsay-vision.md); settled forks pinned in [decisions.md](decisions.md) — canon/testimony split, fog-as-disclosure tiers, grid-as-reference (hex/square/freeform), the living warband page, conclusion-by-GM-act-only (no mortality clock), and now the local-first-prototype scope fork.
- **Moved out of Fragments' docs into this folder (2026-07-16).** Hearsay shares the family mission (protect the ritual of play) and conventions but no code or product decisions with Fragments; its forks pin here, never to Fragments' decisions file.

## Prototype: what's deferred (not refused)
- **No backend / real-time sync** — the first thing needing a server; the table currently hands campaigns around via export/import. This is the top roadmap rung.
- **No painted fog, no map-grows-at-the-edges, no archive-shelf polish** — all in the vision, none needed to answer the validation question.
- **No auth** — seats are a local, table-private choice, honest for a closed table testing the idea.
- **Grid overlay** draws square/hex for reference but pins don't snap to it yet.

## Next candidates (not yet forks)
1. **The pre-build validation test:** run Rian's Frostgrave campaign for 3–4 sessions on a shared image + numbered pins + a doc per player. The hypothesis everything hinges on: players write testimony unnagged. This gates the build, per decisions.md's validation paragraph.
2. **Prototype scope sketch** once the test signals: the map viewport (an image + normalized-coordinate pins + pan/zoom — Fragments' `src/tree/viewport.ts` gestures are the same interaction), the pin/slot data model, and the session scrubber — named in the vision doc as the single most important interaction to get right.
3. **Surfaced by the competitive scan, ranked by leverage:**
   - **Testimony juxtaposition** `[do-now, no backend]` — two+ seats' accounts of the same pin side by side, contradictions visible. The scan's strongest point: *absent from every competitor* because none center plural memory; it's what makes "plural memory is the artifact" legible rather than merely stored. Highest-value next build; pure UI over data already modeled. (Rian confirmed it's the lead candidate but deferred building it past this session.)
   - **Pin clustering + spiderfy** `[do-now, no backend]` — same-coordinate pins stacked across sessions must fan out on zoom, or the map stops being browsable as a campaign matures. The real completion of this session's legibility work.
   - **Three-state fog** (hidden / *sensed* / revealed, reveal as a scrubber event) `[with-backend]` — richens fog v1's binary from Foundry's "Limited" tier + World Anvil's unlock-as-event.
   - **Per-seat timeline lanes** in the scrubber `[with-backend]` — watch each player's testimony thread advance in parallel (World Anvil Chronicles' lanes, recast for plural memory).
   - **Player-suggested pins** `[with-backend]` — the proposal model above, built once Supabase exists.

## Open design questions (from the vision doc)
- Painted fog: v1 or first post-validation feature? (Hidden pins are v1 either way.)
- Warband snapshot granularity — leaning on-edit with a session stamp.
- Competitive sealing ("sealed until both sides have written") — let the Frostgrave test answer it.
- The archive shelf: concluded campaigns as pin-dense map thumbnails (identity-is-the-shape), not yet designed.

## Principles (bind all future work)
Plural memory is the artifact · canon/testimony split, authority by layer · identity-first, table-private · the map is the browse surface · sessions are the clock · every system must survive a low-energy month.
