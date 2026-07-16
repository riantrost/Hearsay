# Hearsay — Living Campaign Tracker

**Status:** Second draft — working title locked (2026-07-16), core forks settling
**Origin:** Sibling concept to Fragments (and Litany before it) — same mission, different table
**Mission (unchanged from the family):** protect the ritual of play
**First validation table:** a Frostgrave campaign (see The Validation Question)

---

## Core Concept

A tabletop campaign generates a world's worth of memory and almost all of it evaporates between sessions. Hearsay is the living record of a campaign: a shared map — uploaded by the table or taken from source material — populated with pins where things *happened*, each pin carrying journals written from every participating player's perspective, under the singular world-ownership of the game master.

The artifact is not a wiki and not a recap. It is **plural memory**: the same battle remembered four different ways, side by side, pinned to the place it happened, accumulating session over session until the map itself reads as the story of the campaign. The name is the thesis — the record is testimony, not truth, and that's what makes it worth keeping.

---

## What It Inherits From the Family, and Where It Inverts

Fragments' central inheritance from Litany was *structural quality control over moderation labor* — and that carries here, but the load-bearing inversion is identity:

- **Fragments is anonymous-first; Hearsay is identity-first.** A campaign is a small, known, closed table. Perspective is the whole point, and perspective needs an author. There is no public browse, no discovery, no strangers. A campaign is as private as the table itself.
- **Fragments branches because contributors are anonymous and unaccountable.** Here the equivalent structural move is the **canon/testimony split** (below): authority and participation are separated by *layer*, not by moderation. The GM never needs to edit a player's words to keep the world coherent, because player words live in a layer that is definitionally subjective.
- **Process-is-the-work survives intact.** The finished campaign is one endpoint; the accumulating, contradictory, in-character record of how it unfolded is the artifact itself. Scrubbing the map through time (below) is this concept's version of scrubbing a fragment's lineage.
- **Every system must survive a low-energy month.** A campaign that goes on hiatus must lose nothing and demand nothing. No streaks, no reminders that shame, no rot.

---

## The Three Layers

### 1. Canon — the GM's layer
The GM owns the world: the map itself, regions, named locations, the larger story arc, and which parts of any of it are *revealed*. Canon is singular by design — one voice, one truth-of-the-world — which is exactly the authority structure a real table already runs on. (In GM-less campaign systems — skirmish wargames like Frostgrave often run without one — the role generalizes to *campaign owner*: whoever organizes the campaign holds the canon layer. The layer model doesn't care whether that person also plays.)

**Fog of war** is the canon layer's visibility control, in escalating tiers:

- **Hidden pins (v1, always on):** locations and events the GM has staged but not revealed simply don't exist on the players' map. Revealing is a GM act, and a reveal is itself an event in the campaign's timeline — the session the players first saw the ruins is part of the record.
- **Painted fog (the true fog-of-war option):** the GM masks regions of the map image itself; players see terra incognita — darkened, clouded, or blank — until the GM unmasks it. Unmasking is coarse and gestural (paint a region, not pixel-perfect erasing), and each unmask is a timeline event like any reveal.
- **Declined: automatic reveal-by-travel** (fog that lifts in a radius around party positions). It implies the app is simulating movement, which drags in position tracking, travel rates, and a real-time-ness that belongs to VTTs. Fog in Hearsay is narrative disclosure, GM-authored, not line-of-sight math.

### 2. Events — the shared skeleton
An event is a pin on the map bound to a session: *a battle happened here, in session 12*. Events are the spine everything hangs on. The GM drops the pin (they know where the party actually was — this keeps canon geography in one pair of hands), and a fresh pin arrives as an **open jack**: a visible invitation awaiting each player's entry. An event with four players attached shows four slots; unwritten ones sit quietly empty, forever fillable, never nagging.

### 3. Testimony — the players' layer
Each player writes their own journal entry per event, from their character's perspective. Testimony is **immutable by anyone but its author** — the GM curates *placement* and *visibility* of events, never the words. Contradiction between testimonies is not an error state; it is the most interesting thing the app can display. Two players remembering the same ambush differently *is* the artifact. There is no merge, no canonical summary that flattens the voices, no editing each other. (Fragments cut merge because it only made sense for text; here merge is cut because it would destroy the plurality that makes the record worth keeping.)

**Visibility is a GM setting, open by default (settled 2026-07-16).** Players read each other's testimony freely — the plural-memory thesis at full strength — unless the GM seals it: per-campaign (testimony private until the campaign concludes) or per-entry (a sealed slot for tables that run secrets between players). Sealing is disclosure control, same family as fog; it never grants editing.

### The warband layer (players describing themselves)
Alongside per-event testimony, each player owns a **warband page** (or character page — the unit depends on the system): a self-authored description of who they're fielding, in their own voice. Unlike testimony, the warband page is a **living document** — the roster changes, soldiers die, the wizard learns things — its author edits it freely, and that's honest to what it describes. What keeps history from vanishing: the session scrubber snapshots it, so the warband page as it stood at session 4 is part of session 4's record. No stats, no points math, no roster validation — that's rules content, refused below; this is the *description*, the thing you'd say when someone asks "who are you playing?"

This also answers what non-spatial self-narration was groping at: the "on the road" scene, the dream, the downtime — most of it is either testimony that can live on the nearest meaningful pin, or self-description that belongs on the warband page. No off-map margin in v1.

---

## The Map Is the Browse Surface

The campaign opens on the map, always. Not a dashboard, not a feed, not a list of sessions — the world itself, with the campaign's history visible on it as accumulated pins. This is the patchbay lesson carried over: the browse surface should *be* the artifact, not an index of it.

- **The map is an image, not GIS.** Uploaded art or scanned source material, pins at normalized coordinates, pan/pinch-zoom (the viewport work Fragments already did is the same interaction). No coordinate systems, no projection — a hand-drawn map on a napkin is a first-class map.
- **One shared world map per campaign (settled 2026-07-16).** Hearsay tracks the story at large, and one world map sells that best; a map-per-scale hierarchy (region → city → dungeon) was considered and declined as navigation design the concept doesn't need yet. Parked, not refused: **the map may grow at the edges** — as the campaign expands past the drawn world, the GM replaces the image with a larger one that anchors the old map inside it, pins carrying over; the growth itself becomes a timeline event. That's expansion in the spirit of one-world-one-map, and it's the fork to reach for before hierarchy ever is.
- **Grid is an optional overlay: hex, square, or freeform (none).** Set by the GM with cell size and offset, drawn over the image. Freeform is the default — the napkin map stays first-class. The grid exists for *reference, not mechanics*: it gives places names ("the ruins at J7"), lets pins optionally snap for tidiness, and speaks hexcrawl to the tables that think in hexes. It resolves nothing, measures nothing, and never becomes a battle grid — the not-a-VTT refusal holds at the grid line.
- **Pins carry visual state legible at a glance:** which events have full testimony vs. open slots, recency, and event type if typed (battle, discovery, loss, arrival — a small self-tagged taxonomy, the Fragments color-grammar move).
- **Sessions are the clock.** The campaign's time axis is not calendar dates but session numbers — the unit the table actually experiences. A **session scrubber** replays the map's growth: drag from session 1 to now and watch pins land, fog lift, warbands change, the story spread across the world. This is the walk-the-lineage interaction translated: the single most important thing to get right, because it is the moment the record becomes *felt* as a story.

---

## The Contribution Ritual

The concept lives or dies on players actually writing, so the ritual is designed for the real energy level of a weeknight after a four-hour session:

- **The GM's post-session act is one pin + one line of canon.** Cheap enough to do from the couch.
- **The player's act is one journal entry on that pin.** No minimum length, no structure imposed. A single in-character sentence is a complete, honored contribution. The empty slot on the pin is the only prompt that exists — visible, patient, never pushed.
- **Late is fine, forever.** A player who writes session 3's entry during session 11's week fills a slot that was always there. The record has gaps the way real memory does; gaps are honest.

---

## Campaign Mortality

**Campaigns conclude by explicit GM act only (settled 2026-07-16).** A concluded campaign moves to a read-only **archive**: closed to new events and testimony, scrubbable forever — the Fragments freeze, minus the timer. No mortality clock exists here, deliberately inverting Fragments: fragments are ephemeral by ethos and need urgency; campaigns hiatus for months and come back, and a clock would punish exactly the low-energy month the family principles protect. The one soft edge worth considering later: unfilled testimony slots in an archived campaign — leaning toward leaving them open (late is fine, forever, even after the end), since a slot filled a year later costs canon nothing.

---

## What It Refuses

- **Not a VTT.** No battle grid, no tokens, no initiative, no dice, no combat resolution. The map records where things happened; it is not where things happen. The grid overlay is reference and wayfinding only. (Roll20 and Foundry own the table-time layer; Hearsay owns the between-sessions layer.)
- **No rules content.** No character sheets, stat blocks, points math, or system mechanics. The warband page is description, not a roster manager. System-agnostic by refusal, not by feature matrix.
- **No worldbuilding wiki.** World Anvil and Kanka serve GMs building encyclopedias; Hearsay is deliberately not that. Canon here is only what the campaign has *touched* — the world exists on the map insofar as the party has been there or the GM has revealed it. An entity with no event attached has no page.
- **No scheduling, no chat, no social features.** Discord exists. No likes, no reactions, no per-player scoreboards — reading each other's testimony is the only social loop, and it needs no metrics.
- **No AI summarization of testimony.** A generated recap is exactly the flattening-to-one-voice the canon/testimony split exists to prevent.

---

## Open Design Questions

1. **Painted fog scope for v1.** Hidden pins are free (visibility flag); painted fog needs a mask-authoring surface and mask rendering. Is it v1 or the first post-validation feature? Leaning: hidden pins v1, painted fog immediately behind it — it's the feature GMs will ask for by name.
2. **Warband snapshot granularity.** Snapshot the warband page every session, or only on edit? Only-on-edit is cheaper and honest (an unchanged page needs no copy); per-session gives the scrubber a uniform clock. Leaning: on-edit, stamped with the current session.
3. **Competitive testimony in GM-less play.** Frostgrave battles are player-vs-player: both sides of the same battle write testimony about *each other*. Does the open-by-default visibility need a "sealed until both have written" option so the second writer isn't shaped by the first? Small feature, real integrity question. Unresolved — the Frostgrave test will answer it from behavior.
4. **What the archive looks like from outside.** Concluded campaigns need a shelf — the family instinct says the shelf shows each campaign as its map thumbnail, dense with its pins (identity-is-the-shape, the patchbay lesson). Not designed yet.

---

## The Validation Question

The unvalidated hypothesis — Hearsay's version of "do creators enjoy contributing to unfinished fragments?" — is: **will players write testimony without being nagged?** GMs demonstrably keep records (every campaign wiki ever); player-side, per-perspective logging is the unproven behavior, and everything distinctive here depends on it.

**The first test table is a Frostgrave campaign (2026-07-16)** — and that's a deliberately hard test, not a soft one. Frostgrave is a competitive skirmish campaign: warbands clash *against each other*, often without a GM, so it stresses the canon layer (owner-who-also-plays), the warband page (rosters that change every game — soldiers die constantly in Frostgrave), and testimony at its most interesting — two opposing players writing rival accounts of the same battle. If plural memory works anywhere, it works where the perspectives literally fought each other; hearsay from both sides of a battle is the name earning itself.

It is cheaply testable before any build, Fragments-style: run the campaign for three or four sessions using a shared image with numbered pins and a doc per player. If the players write, the plural-memory thesis has legs. If only the organizer writes, this collapses into a worldbuilding wiki — a product that already exists and that Hearsay explicitly refuses to be.
