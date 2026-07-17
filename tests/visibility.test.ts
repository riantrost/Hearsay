// The session filter is the scrubber's contract: a pin exists on the map
// only once revealed AND once something has happened there. The owner's
// exception (ghostPins) keeps a freshly named place reachable so it can
// receive its first event — for players the line holds unchanged.

import { describe, expect, it } from 'vitest';
import { ghostPins, visiblePins } from '../src/map/render';
import { seed } from '../src/data/seed';

describe('visiblePins', () => {
  it('shows only pins with events at or before the session', () => {
    expect(visiblePins(seed, 1).map((p) => p.id)).toEqual(['p2']);
    expect(visiblePins(seed, 2).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('never shows a pin with no events — a site with no history has no page', () => {
    // p3 (the Citadel) is revealed at session 3 but has no events yet
    expect(visiblePins(seed, 4).map((p) => p.id)).not.toContain('p3');
  });

  it('holds hidden pins back until their reveal session even if events exist', () => {
    const data = structuredClone(seed);
    data.events.push({ id: 'ex', pinId: 'p3', session: 2, canonLine: 'staged', participantIds: [] });
    expect(visiblePins(data, 2).map((p) => p.id)).not.toContain('p3');
    expect(visiblePins(data, 3).map((p) => p.id)).toContain('p3');
  });

  it('shows the full map at the current session', () => {
    expect(visiblePins(seed, 4).map((p) => p.id)).toEqual(['p1', 'p2', 'p4']);
  });
});

describe('ghostPins (the owner reaches sites with no history yet)', () => {
  // p3 (the White Tower) is revealed at session 3 but has no events

  it('returns revealed, event-less pins so the owner can finish the act', () => {
    expect(ghostPins(seed, 4).map((p) => p.id)).toEqual(['p3']);
  });

  it('keeps unrevealed pins hidden even from ghosting — step 8 owns that door', () => {
    // at session 2, p4 has no history yet (first event: session 4) so it
    // ghosts; p3 is unrevealed until session 3 and must not appear at all
    expect(ghostPins(seed, 2).map((p) => p.id)).toEqual(['p4']);
    expect(ghostPins(seed, 2).map((p) => p.id)).not.toContain('p3');
  });

  it('never overlaps visiblePins — every pin is on exactly one side of the line', () => {
    for (const session of [1, 2, 3, 4]) {
      const vis = new Set(visiblePins(seed, session).map((p) => p.id));
      for (const p of ghostPins(seed, session)) expect(vis.has(p.id)).toBe(false);
    }
  });
});
