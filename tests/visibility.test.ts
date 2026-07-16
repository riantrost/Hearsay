// The session filter is the scrubber's contract: a pin exists on the map
// only once revealed AND once something has happened there.

import { describe, expect, it } from 'vitest';
import { visiblePins } from '../src/map/render';
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
