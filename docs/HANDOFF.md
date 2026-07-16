# Hearsay — Session Handoff
*Start any new development session from this doc + docs/hearsay-vision.md.*

## Project state (2026-07-16, first session)
- **Concept designed, no code yet.** Hearsay is a living record of tabletop campaigns: one shared world map per campaign accumulating event pins, each pin carrying per-player journals (testimony) under the GM's canon ownership. Full concept in [hearsay-vision.md](hearsay-vision.md); ten settled forks pinned in [decisions.md](decisions.md) — including the canon/testimony split, fog-as-disclosure tiers, grid-as-reference (hex/square/freeform), the living warband page, and conclusion-by-GM-act-only (no mortality clock, inverting Fragments).
- **Moved out of Fragments' docs into this folder (2026-07-16).** Hearsay shares the family mission (protect the ritual of play) and conventions but no code or product decisions with Fragments; its forks pin here, never to Fragments' decisions file.

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
