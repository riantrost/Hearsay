# Hearsay — Session Handoff
*Start any new development session from this doc + [hearsay-vision.md](hearsay-vision.md). Settled forks live in [decisions.md](decisions.md) — don't relitigate.*

## Project state (2026-07-17, fourth session — histories reconciled, V1 pinned)
- **The two parallel prototypes are reconciled; the Vite line is the mainline** (fork pinned in decisions.md, "The mainline is the Vite prototype"). Cloud sessions had built a buildless local-first PWA while local sessions built the agreed Vite + TypeScript + Vitest prototype; the histories merged 2026-07-17 with the Vite line carrying forward. The spike lives at `docs/archive/local-first-pwa/` (history only — don't build on it), and its learnings are harvested: the deliberate-pin-placement fork, the proposal pattern, `--pin-k` constant-size pin rendering, the competitive-scan findings, and headless-driver verification.
- **What runs today (`src/`, `npm run dev` / `npm test`):** map viewport with pan/zoom over a real map image (Lawrence's Northmarch), normalized-coordinate pins, a pin surface in progress, and a **Store that enforces the settled forks in code** — the testimony grace window (`canEdit` refuses once a later session's event lands), the marks brevity cap, participant-only slots, and the **pending-visibility rule** (`testimonyVisibleTo`: a pending member's words render only for themselves and the owner; everyone else sees an open slot). localStorage stands in for the backend deliberately; **the Store's mutation surface is the shape of the eventual API.** Suite: 14 checks green (4 visibility + 10 store), `tsc` clean.
- **The model is the five-entity V1 shape (roadmap step 1, done 2026-07-17):** Mark folded into `markText` on Testimony, SiteCanon dropped from build scope, `joinCode` on Campaign, `status: active|pending` on Member, `campaignId` on Member/Pin. The dev seed carries a pending member (Thistle, m4) so the visibility rule stays exercised. localStorage key bumped to `hearsay-data-v2` — old cached shapes don't migrate, they reseed.
- **The app is real (roadmap step 3, done 2026-07-17):** the localStorage Store retired; the app boots from a stored seat (`src/seat.ts`) into an `ApiStore` (cached CampaignData + async mutations that apply the server's returned record), or lands on the front door (`src/landing.ts`: found a campaign with name + map file, or join by code). The owner's identity panel shows the join code (rotate button), and pending members appear as proposal rows with approve/decline; a pending seat sees the "visible only to you and the owner" hint. Approve/decline/rotate endpoints landed server-side — decline deletes the seat *and* the never-table-visible words. Dev now runs two processes: `npm run api` (wrangler, functions) + `npm run dev` (vite, proxies `/api` → 8788 via vite.config.ts). Verified: 34 e2e API checks + the full UI loop driven in-browser (create → pin → join → approve → rotate → both seats testifying). The event-less-pin trap found during that drive is fixed: `ghostPins` (src/map/render.ts) renders the owner's unwritten sites dashed-and-hollow at the present so a named place can always receive its first event — "a site with no history has no page" holds unchanged for players, and the rule is pinned in tests/visibility.test.ts.
- **The backend stands (roadmap step 2, done 2026-07-17):** Cloudflare Pages Functions in `functions/`, per Fragments' pattern. The rules moved to a pure shared layer (`src/mutations.ts`) that both the client Store and the server run — the forks are enforced on both sides of the wire, and `visibleData` strips pending testimony server-side so no client can read past its seat. Storage is one KV record per entity under a `c:{cid}:` prefix (concurrent testifiers can't clobber each other); map images in R2. Identity is table-cheap: create/join mints a bearer token, who-is-writing always comes from the token, never the body. Endpoints: `POST /api/campaigns` (multipart, mints owner seat + token + join code), `POST /api/join` (code → pending seat), `GET /api/campaigns/:id` (seat-filtered), owner-only `pins`/`events`/`session`, member `testimony`/`marks`, `GET /api/maps/:id`. Verified end-to-end against `wrangler pages dev` (`npm run api` after a build): 20 live checks including the pending strip, the grace-window 409, and role refusals. The app still runs on the localStorage Store — wiring waits for the join flow (step 3), since no seat exists to call the API from until then. `wrangler.toml` carries a placeholder KV id; real bindings are minted at deploy (step 9).
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

## Roadmap to V1 (in order — next session starts at step 4)
1. ~~**Simplify the model in code**~~ — done 2026-07-17: five entities, `markText` fold, SiteCanon dropped, `joinCode`/`status` added, pending-visibility rule enforced in `testimonyVisibleTo` and pinned by tests.
2. ~~**Stand up the backend**~~ — done 2026-07-17: Pages Functions over KV+R2, rules shared via `src/mutations.ts`, bearer-token seats, seat-filtered GET; verified live with 20 checks against `wrangler pages dev`. Approve/decline/rotate endpoints deliberately deferred to step 3 with their flow.
3. ~~**Join + approval flow**~~ — done 2026-07-17: landing (found/join), seat-token boot, owner's proposal rows with approve/decline, code rotation. The localStorage Store retired with it; the ApiStore is the only store.
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
