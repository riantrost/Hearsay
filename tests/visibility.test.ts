// The map's line: a pin exists on the table's map only once something has
// happened there. The owner's exception (ghostPins) keeps a freshly named
// place reachable so it can receive its first event — for players the line
// holds unchanged.

import { describe, expect, it } from 'vitest';
import { ghostPins, visiblePins } from '../src/derive';
import { night, seed } from '../src/data/seed';

describe('visiblePins', () => {
  it('shows every unhidden pin that carries history', () => {
    expect(visiblePins(seed).map((p) => p.id)).toEqual(['p1', 'p2', 'p4']);
  });

  it('never shows a pin with no events — a site with no history has no page', () => {
    // p3 (the White Tower) has no events yet
    expect(visiblePins(seed).map((p) => p.id)).not.toContain('p3');
  });

  it('holds hidden pins back even if prepped events exist', () => {
    const data = structuredClone(seed);
    data.pins.find((p) => p.id === 'p3')!.hidden = true;
    data.events.push({ id: 'ex', pinId: 'p3', createdAt: night(2), canonLine: 'staged', participantIds: [] });
    expect(visiblePins(data).map((p) => p.id)).not.toContain('p3');
  });
});

describe('ghostPins (the owner reaches sites with no history yet)', () => {
  it('returns event-less pins so the owner can finish the act', () => {
    expect(ghostPins(seed).map((p) => p.id)).toEqual(['p3']);
  });

  it('keeps staged pins out of the ghost layer — staging owns that door', () => {
    const data = structuredClone(seed);
    data.pins.find((p) => p.id === 'p3')!.hidden = true;
    expect(ghostPins(data)).toEqual([]);
  });

  it('never overlaps visiblePins — every pin is on exactly one side of the line', () => {
    const vis = new Set(visiblePins(seed).map((p) => p.id));
    for (const p of ghostPins(seed)) expect(vis.has(p.id)).toBe(false);
  });
});
