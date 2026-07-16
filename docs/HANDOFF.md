# Hearsay — Session Handoff
*Start any new development session from this doc + docs/hearsay-vision.md.*

## Project state (2026-07-16, second session)
- **Concept designed, validation closed, build gate open. No code yet.** Hearsay is a living record of tabletop campaigns: one shared world map per campaign accumulating **pins (places)** where **events accumulate**, each event carrying per-player journals (testimony) under the GM's canon ownership. Full concept in [hearsay-vision.md](hearsay-vision.md); twelve settled forks pinned in [decisions.md](decisions.md).
- **Second session settled three forks:** the **pin/event split** (a pin is a site, dropped once; battles stack on it; lineage is the value — the stacked-pins problem dissolved), **site canon accreting from history** (the owner's one line the environment remembers, guarded to only-what-events-left-behind), and **marks** (one line of testimony promoted to graffiti on the pin — unattributed at a glance, brevity-capped, possibly false, no replies).
- **The validation question is closed as validated (2026-07-16), paper test skipped:** the table's local Discord already shows players writing battle accounts unnagged. Behavioral sub-questions (competitive sealing, marks uptake) move to the live campaign on the built tool.
- **Moved out of Fragments' docs into this folder (2026-07-16).** Hearsay shares the family mission (protect the ritual of play) and conventions but no code or product decisions with Fragments; its forks pin here, never to Fragments' decisions file.

## Next candidates (not yet forks)
1. **Prototype scope sketch** — now the front item, the build gate is open: the map viewport (an image + normalized-coordinate pins + pan/zoom — Fragments' `src/tree/viewport.ts` gestures are the same interaction), the pin → events → testimony-slots data model (note: pin is a place, events are children — post-split shape), and the session scrubber — named in the vision doc as the single most important interaction to get right.
2. **Pin surface design:** how a site page presents its lineage — events in order, site canon line, marks rendered as found graffiti. The marks visual language (weathered, unattributed) is the identity moment.

## Open design questions (from the vision doc)
- Painted fog: v1 or first post-validation feature? (Hidden pins are v1 either way.)
- Warband snapshot granularity — leaning on-edit with a session stamp.
- Competitive sealing ("sealed until both sides have written") — answer from live behavior on the built tool.
- Marks uptake: do players promote lines, and does anyone lie? Watch the live campaign.
- The archive shelf: concluded campaigns as pin-dense map thumbnails (identity-is-the-shape), not yet designed.

## Principles (bind all future work)
Plural memory is the artifact · canon/testimony split, authority by layer · identity-first, table-private · the map is the browse surface · sessions are the clock · every system must survive a low-energy month.
