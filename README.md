# Hearsay

A living record of tabletop campaigns: one shared world map per campaign, pins where things happened, and per-player journals (testimony) under the campaign owner's canon. Plural memory is the artifact — the same battle remembered differently by everyone who was there.

Sibling to Litany and Fragments (same mission: protect the ritual of play); shares their conventions but no code or product decisions. Start with [docs/HANDOFF.md](docs/HANDOFF.md) for current state and the V1 roadmap.

## Layout
- `src/` — the mainline prototype: vanilla TypeScript + Vite, no framework. `model.ts` (data shapes), `store.ts` (mutations that enforce the settled forks — its surface is the shape of the eventual API), `map/` (viewport, pins, pin surface).
- `tests/` — Vitest suite. The contract between sessions: a session that ends red didn't end.
- `public/maps/` — map images for the dev seed.
- `docs/HANDOFF.md` — current state, V1 requirements, and the build roadmap. Sessions start here.
- `docs/hearsay-vision.md` — the full concept. `docs/decisions.md` — settled forks, one paragraph each; closed means closed.
- `docs/archive/local-first-pwa/` — a superseded parallel prototype, kept for history only. Its viewport code is still read as reference for two map-UX moves; don't build on it.

## Commands
```sh
npm run dev      # Vite dev server
npm test         # Vitest suite
npm run build    # tests + typecheck + build
```

## Two decisions worth knowing before touching anything
- **Server-authoritative, no service worker in V1.** Campaign data is fetched fresh; device storage is never the record, and nothing may ship that can pin a stale app on someone's phone. See decisions.md before adding any caching.
- **Not a VTT, no rules content, no wiki, no chat, no AI recaps.** The refusals are load-bearing.
