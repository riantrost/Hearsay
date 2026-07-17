# Hearsay — session context

Living record of tabletop campaigns: a shared world map accumulating pins where things happened, each pin carrying journals from every player's perspective under the GM's singular world-ownership — plural memory as the artifact. Sibling app to Fragments and Litany (same mission: protect the ritual of play); it shares the family's conventions but no code or product decisions with either.

Read [docs/HANDOFF.md](docs/HANDOFF.md) for current state, [docs/hearsay-vision.md](docs/hearsay-vision.md) for the full concept, [docs/decisions.md](docs/decisions.md) for settled forks — don't relitigate settled decisions.

## Working style (carried from Litany)

Rian iterates rapidly and deliberately offloads separable side work to subagents to keep the main thread focused:

- Use built-in subagents (`Explore`, `Plan`, `general-purpose`) for self-contained side tasks: research sweeps, test writing, verification passes, architecture planning.
- Offload chunky, separable tasks — don't reflexively parallelize small ones; spawning is the expensive path.
- Subagents start cold: give them self-contained prompts with file paths and context.
- Main-thread conversation stays on the current iteration; suggest "subagent that" when a side task threatens to derail it.

## Commit & decision voice (carried from Litany)

Commits are the project's memory — write them so a reader a year out learns the *thinking*, not just the diff:

- **Subject is a design thesis, not a changelog line.** Present tense, no ticket-speak.
- **Body carries the why and the boundary** — what the change protects or unlocks.
- **Record the road not taken.** When a plausible bigger move was consciously declined, name it.
- **State the test delta** when tests moved, and **pin settled forks to `docs/decisions.md`** by name.

Keep the homes unmixed: `docs/decisions.md` is for **product/scope forks** (thesis heading + one dense paragraph, dated). Process conventions live here in CLAUDE.md, never in decisions.md.

## Housekeeping

- Update `docs/HANDOFF.md` at the end of substantial sessions.
- New settled decisions get a paragraph in `docs/decisions.md`.
- The test suite (`npm test`) is the contract between sessions — a session that ends red didn't end.

## Principles (bind all future work)

Plural memory is the artifact (testimony over recap) · canon/testimony split: authority by layer, never by moderation · identity-first, table-private · the map is the browse surface · sessions are the clock · every system must survive a low-energy month (carried from Litany).
