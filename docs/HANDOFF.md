# Hearsay — Session Handoff
*Start any new development session from this doc + [hearsay-vision.md](hearsay-vision.md). Settled forks live in [decisions.md](decisions.md) — don't relitigate.*

## Project state (2026-07-17, fourth session — histories reconciled, V1 pinned)
- **The two parallel prototypes are reconciled; the Vite line is the mainline** (fork pinned in decisions.md, "The mainline is the Vite prototype"). Cloud sessions had built a buildless local-first PWA while local sessions built the agreed Vite + TypeScript + Vitest prototype; the histories merged 2026-07-17 with the Vite line carrying forward. The spike lives at `docs/archive/local-first-pwa/` (history only — don't build on it), and its learnings are harvested: the deliberate-pin-placement fork, the proposal pattern, `--pin-k` constant-size pin rendering, the competitive-scan findings, and headless-driver verification.
- **What runs today (`src/`, `npm run dev` / `npm test`):** map viewport with pan/zoom over a real map image (Lawrence's Northmarch), normalized-coordinate pins, a pin surface in progress, and a **Store that enforces the settled forks in code** — the testimony grace window (`canEdit` refuses once a later session's event lands), the marks brevity cap, participant-only slots, and the **pending-visibility rule** (`testimonyVisibleTo`: a pending member's words render only for themselves and the owner; everyone else sees an open slot). localStorage stands in for the backend deliberately; **the Store's mutation surface is the shape of the eventual API.** Suite: 14 checks green (4 visibility + 10 store), `tsc` clean.
- **The model is the five-entity V1 shape (roadmap step 1, done 2026-07-17):** Mark folded into `markText` on Testimony, SiteCanon dropped from build scope, `joinCode` on Campaign, `status: active|pending` on Member, `campaignId` on Member/Pin. The dev seed carries a pending member (Thistle, m4) so the visibility rule stays exercised. localStorage key bumped to `hearsay-data-v2` — old cached shapes don't migrate, they reseed.
- **The competitive scan (cloud session, banked):** no surveyed tool (VTTs: Owlbear, Foundry, Roll20, Alchemy; worldkeepers: World Anvil, Kanka, LegendKeeper, Obsidian+Leaflet) centers per-seat testimony — the thesis is an open lane. Its strongest finding, **testimony juxtaposition** (two seats' accounts of the same pin side by side), is the lead post-V1 candidate.
- Concept, validation (closed 2026-07-16), and the family relationship (sibling of Litany, met only at its storefront) are all pinned in decisions.md.

## V1 requirements (the owner's, 2026-07-17)
**Done means: the Frostgrave table runs a real session night on it, from their own phones, with fresh data.**
1. **Recent activity is visible on the map** — pins with recent events read as alive at a glance (recency, open testimony slots). This is the vision's "pins carry visual state" line; no schema needed — it derives from session stamps.
2. **Campaign Managers create a campaign** (name + map image) **and add players whenever they want.**
3. **Players join active campaigns via the campaign's join code.**
4. **Players can share the code onward; the owner approves.** A joiner is a *pending* member who can write immediately, visible only to themselves and the owner; approval makes their posts visible to the table. (Fork: "Membership follows the proposal pattern.")
5. **Sessions update fast on every device, and the app can never pin itself stale.** Server-authoritative data, network-first fetch, refetch on focus, short poll while a pin is open; **no service worker in V1.** (Fork: "V1 is server-authoritative.")

## V1 data model (five entities — simplified 2026-07-17)
```
Campaign   { id, name, mapImageUrl, mapW, mapH, currentSession, joinCode }
Member     { id, campaignId, name, role: owner|player, status: active|pending }
Pin        { id, campaignId, x, y, name, hiddenUntilSession? }
Event      { id, pinId, session, canonLine, participantIds }
Testimony  { id, eventId, memberId, session, text, markText? }
```
Down from seven: **Mark folds into `markText` on Testimony** (the fork's own words — a highlight, not a content type) and **SiteCanon defers out of V1 build scope** (the accretes-from-history design stays settled; it returns post-V1). Everything below Campaign carries a `session` stamp — that column is the scrubber, and recency illumination derives from it.

## Roadmap to V1 (in order — next session starts at step 2)
1. ~~**Simplify the model in code**~~ — done 2026-07-17: five entities, `markText` fold, SiteCanon dropped, `joinCode`/`status` added, pending-visibility rule enforced in `testimonyVisibleTo` and pinned by tests.
2. **Stand up the backend**: Cloudflare Pages Functions + storage (per Fragments' `contrib/db.ts` pattern). Endpoints mirror the Store's mutation surface — it was written as the API shape. Identity stays table-cheap: the join code mints a member token (localStorage, recoverable by re-invite); no accounts, no passwords.
3. **Join + approval flow**: create campaign → owner seat; enter code → pending member; owner's approve/decline list; rotate code.
4. **Freshness discipline**: network-first data fetch, refetch on focus, short poll while a pin surface is open. No service worker — verify none ships in the build output.
5. **Port the spike's map UX** (reference: `docs/archive/local-first-pwa/js/`): armed "＋ Pin" placement, `--pin-k` counter-scale so pins hold legible size at any zoom.
6. **Pin surface pass**: recency illumination (latest event session vs `currentSession`), open-slot jacks, testimony reading + writing + mark promotion. This is the identity moment — it gets a design pass, not just CRUD.
7. **Session scrubber**: filter on the session stamp + drag control, marks appearing when scrawled.
8. **Hidden pins**: visibility flag, owner toggle, reveal-as-event.
9. **Deploy**: Cloudflare Pages preview project, `noindex`, with a served-hash verification step (Litany's fingerprint habit — trust the proof, not the success message).

## Deferred past V1 (not refused)
Testimony juxtaposition (lead candidate) · site canon returns · painted fog · warband pages + snapshots · sealing (answer from live behavior) · player-proposed pins (designed, fork pinned) · map growth · archive shelf · event-type color grammar · installability (only with a deliberately update-disciplined service worker).

## Open design questions
- Competitive sealing ("sealed until both sides have written") — watch the live campaign.
- Marks uptake: do players promote lines, and does anyone lie? Watch the live campaign.
- The archive shelf: concluded campaigns as pin-dense map thumbnails — not yet designed.
- Painted fog's authoring surface — post-V1, likely the first thing GM-shaped tables ask for by name.

## Principles (bind all future work)
Plural memory is the artifact · canon/testimony split, authority by layer · identity-first, table-private · the map is the browse surface · sessions are the clock · every system must survive a low-energy month.
