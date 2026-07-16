# Decisions

One paragraph per settled fork. Once an item lands here, treat it as closed — don't re-litigate it in a session unless new information genuinely overturns it. (Convention carried from Litany via Fragments. These pins carry the *decision*; the narrative context lives in [hearsay-vision.md](hearsay-vision.md).)

## The working title is Hearsay
Locked 2026-07-16. The name is the thesis: the record is testimony, not truth — the same battle remembered differently by everyone who was there, and that plurality is what makes the record worth keeping. Candidates *Annals*, *Waypoints*, and *Chronicle* were considered and passed over as describing a record rather than a stance about one.

## Authority is split by layer, never enforced by moderation
The GM (generalized to *campaign owner* in GM-less systems like Frostgrave — the layer model doesn't care whether that person also plays) owns canon: the map, locations, reveals, story arc, and where event pins land. Players own testimony: per-event journals immutable by anyone but their author. The GM curates placement and visibility of events, never the words — canon never requires editing anyone's testimony because testimony is definitionally subjective. Contradiction between testimonies is not an error state; it is the artifact. Merge and canonical summaries are refused: they flatten the plurality the app exists to keep (2026-07-16).

## Testimony is visible between players by default; sealing is a GM setting
Players read each other's testimony freely — plural memory at full strength — unless the GM seals it per-campaign (private until conclusion) or per-entry (for tables that run secrets). Sealing is disclosure control, the same family as fog; it never grants editing (settled 2026-07-16). Open sub-question, deferred to the Frostgrave test: whether competitive play needs a "sealed until both sides have written" mode so rival accounts of the same battle aren't shaped by whoever writes first.

## Fog of war is narrative disclosure, not line-of-sight math
Tiered: **hidden pins** first (staged locations and events simply don't exist on the players' map until the GM reveals them — and a reveal is itself a timeline event), **painted fog** behind it (the GM masks regions of the map image and unmasks them gesturally; each unmask lands in the timeline). Declined: automatic reveal-by-travel radius fog — it smuggles in position tracking and movement simulation, which belongs to VTTs. Fog in Hearsay is GM-authored disclosure of the story's world, full stop (2026-07-16).

## One shared world map per campaign; it may grow at the edges
Hearsay tracks the story at large and one world map sells that best (settled 2026-07-16). A map-per-scale hierarchy (region → city → dungeon) was declined as navigation design the concept doesn't need. Parked, not refused: as a campaign outgrows the drawn world, the GM replaces the map image with a larger one anchoring the old map inside it, pins carrying over, the growth itself a timeline event — expansion in the spirit of one-world-one-map, and the fork to reach for before hierarchy ever is.

## The grid is reference, not mechanics
An optional overlay — hex, square, or freeform (none), freeform the default so a napkin map stays first-class — set by the GM with cell size and offset (2026-07-16). It exists to give places names ("the ruins at J7"), optionally snap pins, and speak hexcrawl to tables that think in hexes. It measures nothing and resolves nothing; the not-a-VTT refusal holds at the grid line.

## The warband page is a living document; testimony is not
Each player owns a self-authored warband/character page — the answer to "who are you playing?", in their own voice (2026-07-16). Unlike testimony it is freely editable by its author, which is honest to what it describes (rosters change, soldiers die), with edits snapshotted under a session stamp so the scrubber shows the warband as it stood at any point. No stats, points math, or roster validation — that's rules content, refused. This layer also absorbed the non-spatial-events question: "on the road" scenes are testimony on the nearest meaningful pin or self-description on the warband page; no off-map margin in v1.

## Campaigns conclude by explicit GM act only
A concluded campaign becomes a read-only archive: closed to new events, scrubbable forever (settled 2026-07-16). No mortality clock exists — a deliberate inversion of Fragments, whose ephemerality ethos needs urgency; campaigns hiatus for months and come back, and a timer would punish exactly the low-energy month the family principles protect. Leaning (not yet settled): testimony slots stay fillable even after conclusion — late is fine, forever, and a slot filled a year later costs canon nothing.

## What Hearsay refuses
Not a VTT (no tokens, initiative, dice, or combat resolution — Hearsay owns the between-sessions layer, not table time). No rules content (system-agnostic by refusal, not feature matrix). No worldbuilding wiki (canon covers only what the campaign has touched; an entity with no event has no page — World Anvil and Kanka own the encyclopedia). No scheduling, chat, likes, or scoreboards (reading each other's testimony is the only social loop). No AI summarization of testimony (a generated recap is exactly the flattening the canon/testimony split exists to prevent). (2026-07-16)

## The first build is a portable, local-first PWA; sync is deferred, not designed-around
The prototype is a buildless Progressive Web App (static files, vanilla ES modules, IndexedDB) rather than a spreadsheet, a native app, or a server-backed web app (2026-07-16). Rationale: the table is ready to use something now, and a portable PWA is the roadmap that can *evolve beyond* — installable on phones, offline, no accounts — without committing to infrastructure before the validation question is answered. Local-first with `.hearsay.json` export/import is the honest stand-in for multiplayer: it lets the closed table pass a campaign device-to-device today, and names sync (a real backend) as the explicit next rung rather than pretending it isn't needed. Declined for this stage: a backend/auth (premature before players are proven to write), and painted fog / map-growth / archive-shelf polish (all in the vision, none load-bearing for the test). The refusals hold unchanged — not a VTT, no rules content, no wiki, no AI summarization.

## The first validation table is a Frostgrave campaign, chosen as the hard test
The unproven behavior is player-side: will players write testimony unnagged? (GM record-keeping is proven by every campaign wiki ever.) Frostgrave stresses every distinctive part at once — competitive, often GM-less, rosters that change every game, rival testimony about the same battle from both sides (2026-07-16). Cheaply testable before any build: three or four sessions on a shared image with numbered pins and a doc per player. If players write, plural memory has legs; if only the organizer writes, the concept collapses into a worldbuilding wiki it refuses to be.
