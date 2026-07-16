# Hearsay — Session Handoff
*Start any new development session from this doc + docs/hearsay-vision.md.*

## Project state (2026-07-16, second session)
- **Concept designed, validation closed, prototype scope agreed. No code yet.** Hearsay is a living record of tabletop campaigns: one shared world map per campaign accumulating **pins (places)** where **events accumulate**, each event carrying per-player journals (testimony) under the GM's canon ownership. Full concept in [hearsay-vision.md](hearsay-vision.md); thirteen settled forks pinned in [decisions.md](decisions.md) — newest: the testimony grace window closes on the table's clock (editable until the next session's first event lands).
- **Second session settled three forks:** the **pin/event split** (a pin is a site, dropped once; battles stack on it; lineage is the value — the stacked-pins problem dissolved), **site canon accreting from history** (the owner's one line the environment remembers, guarded to only-what-events-left-behind), and **marks** (one line of testimony promoted to graffiti on the pin — unattributed at a glance, brevity-capped, possibly false, no replies).
- **The validation question is closed as validated (2026-07-16), paper test skipped:** the table's local Discord already shows players writing battle accounts unnagged. Behavioral sub-questions (competitive sealing, marks uptake) move to the live campaign on the built tool.
- **Moved out of Fragments' docs into this folder (2026-07-16).** Hearsay shares the family mission (protect the ritual of play) and conventions but no code or product decisions with Fragments; its forks pin here, never to Fragments' decisions file.

## Prototype scope (sketched 2026-07-16, agreed — build next)
**Done means:** the Frostgrave table can run a real session night on it. Stack carried from Fragments: vanilla TypeScript + Vite + Vitest, no framework, Cloudflare Pages + Functions (storage per Fragments' `contrib/db.ts` pattern).

**In:**
1. **Map viewport** — uploaded image, pan/pinch-zoom, normalized-coordinate pins (port Fragments' `src/tree/viewport.ts` interaction). Grid overlay rendering only (hex/square/freeform).
2. **Pin surface** — the site page: events in session order, site canon lines, marks as found graffiti. The identity moment; gets a design pass, not just CRUD.
3. **Event + testimony loop** — owner adds event (session + one canon line), slots per player, players write; mark = promote one sentence of own testimony, brevity cap enforced at promotion.
4. **Session scrubber** — filter on the session stamp everything already carries, plus the drag control.
5. **Hidden pins** — visibility flag + owner toggle.
6. **Identity, table-cheap** — attributed, not authenticated: owner creates campaign → invite link → players claim a name (localStorage token, recoverable by re-invite). No accounts, no passwords. (Agreed 2026-07-16; prototype-level, not a pinned fork.)

**Out (deferred, not refused):** painted fog · warband pages + snapshots · sealing · map growth · archive shelf · event-type color grammar.

**Data model shape:** Campaign → Member · Pin → SiteCanon (append-only) · Pin → Event → Testimony → Mark (denormalizes pinId + session for map rendering). Everything below Campaign carries a `session` stamp — that column *is* the scrubber. Testimony editability closes on the table's clock — see the grace-window fork in [decisions.md](decisions.md).

**Build order:** viewport → pin/event/testimony loop (ugly) → scrubber → pin surface design pass → hidden pins + invite flow. Scrubber deliberately before polish: if it doesn't feel like a story with ugly pins, polish won't save it.

## Open design questions (from the vision doc)
- Painted fog: v1 or first post-validation feature? (Hidden pins are v1 either way.)
- Warband snapshot granularity — leaning on-edit with a session stamp.
- Competitive sealing ("sealed until both sides have written") — answer from live behavior on the built tool.
- Marks uptake: do players promote lines, and does anyone lie? Watch the live campaign.
- The archive shelf: concluded campaigns as pin-dense map thumbnails (identity-is-the-shape), not yet designed.

## Principles (bind all future work)
Plural memory is the artifact · canon/testimony split, authority by layer · identity-first, table-private · the map is the browse surface · sessions are the clock · every system must survive a low-energy month.
