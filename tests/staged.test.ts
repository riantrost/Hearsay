// The staging layer, pinned from docs/decisions.md (fog): staged pins and
// their prepped events simply don't exist for players — not on the map, not
// in the payload — and the only door out of staging once history exists is
// a reveal, which is itself a timeline event.

import { describe, expect, it } from 'vitest';
import { revealPin, setPinHidden, visibleData } from '../src/mutations';
import { ghostPins, stagedPins, visiblePins } from '../src/derive';
import { HOUR, night, seed } from '../src/data/seed';
import type { CampaignData } from '../src/model';

/** Seed plus one staged pin with one prepped event (and testimony on it). */
function withStaged(): CampaignData {
  const data = structuredClone(seed);
  data.pins.push({ id: 'ps', campaignId: 'c1', x: 0.5, y: 0.5, name: 'The Sunken Vault', hidden: true });
  data.events.push({ id: 'es', pinId: 'ps', createdAt: night(4), canonLine: 'Prepped in secret.', participantIds: ['m1'] });
  data.testimony.push({ id: 'ts', eventId: 'es', memberId: 'm1', createdAt: night(4) + HOUR, text: 'Notes to myself.' });
  return data;
}

describe('setPinHidden', () => {
  it('stages and unstages an event-less pin freely', () => {
    const data = structuredClone(seed);
    expect(setPinHidden(data, 'p3', true).hidden).toBe(true);
    expect(stagedPins(data).map((p) => p.id)).toEqual(['p3']);
    expect(setPinHidden(data, 'p3', false).hidden).toBeUndefined();
    expect(stagedPins(data)).toEqual([]);
  });

  it('refuses to hide a place with history — the table remembers it', () => {
    const data = structuredClone(seed);
    expect(() => setPinHidden(data, 'p2', true)).toThrow(/already has history/);
  });

  it('refuses to unhide a staged place with prepped events — reveal is the only door', () => {
    const data = withStaged();
    expect(() => setPinHidden(data, 'ps', false)).toThrow(/returns only by reveal/);
  });
});

describe('revealPin', () => {
  it('unhides and lands the reveal as an event — the event is the record', () => {
    const data = withStaged();
    const before = Date.now();
    const { pin, event } = revealPin(data, 'ps', 'The vault doors stand open.');
    expect(pin.hidden).toBeUndefined();
    expect(event.createdAt).toBeGreaterThanOrEqual(before);
    expect(event.canonLine).toBe('The vault doors stand open.');
    expect(data.events).toContain(event);
  });

  it('the pin joins the table\'s map only through the reveal', () => {
    const data = withStaged();
    expect(visiblePins(data).map((p) => p.id)).not.toContain('ps');
    revealPin(data, 'ps', 'The vault doors stand open.');
    expect(visiblePins(data).map((p) => p.id)).toContain('ps');
  });

  it('refuses a pin that is not staged, and an empty canon line leaves staging intact', () => {
    const data = withStaged();
    expect(() => revealPin(data, 'p2', 'x')).toThrow(/not staged/);
    expect(() => revealPin(data, 'ps', '   ')).toThrow(/needs its line of canon/);
    expect(data.pins.find((p) => p.id === 'ps')?.hidden).toBe(true);
  });
});

describe('visibleData strips the staged layer', () => {
  it('a player payload has no staged pin, no prepped event, no testimony on it', () => {
    const view = visibleData(withStaged(), 'm2');
    expect(view.pins.map((p) => p.id)).not.toContain('ps');
    expect(view.events.map((e) => e.id)).not.toContain('es');
    expect(view.testimony.map((t) => t.id)).not.toContain('ts');
  });

  it('the owner sees the secret layer whole', () => {
    const view = visibleData(withStaged(), 'm1');
    expect(view.pins.map((p) => p.id)).toContain('ps');
    expect(view.events.map((e) => e.id)).toContain('es');
    expect(view.testimony.map((t) => t.id)).toContain('ts');
  });

  it('strips ghost pins too — a named, event-less place is owner-only scaffolding', () => {
    // seed's p3 (the White Tower) has no events: a ghost
    const data = structuredClone(seed);
    expect(visibleData(data, 'm2').pins.map((p) => p.id)).not.toContain('p3');
    expect(visibleData(data, 'm1').pins.map((p) => p.id)).toContain('p3');
    // pins that carry history still reach the player
    expect(visibleData(data, 'm2').pins.map((p) => p.id)).toEqual(expect.arrayContaining(['p1', 'p2', 'p4']));
  });
});

describe('map layers keep staged pins out of the ordinary world', () => {
  it('staged pins are neither visible nor ghosts, even with prepped events', () => {
    const data = withStaged();
    expect(visiblePins(data).map((p) => p.id)).not.toContain('ps');
    expect(ghostPins(data).map((p) => p.id)).not.toContain('ps');
    expect(stagedPins(data).map((p) => p.id)).toEqual(['ps']);
  });
});

describe('a prepped event surfaces as backstory after the reveal', () => {
  it('the place arrives carrying its prepped past, ordered before the reveal', () => {
    const data = withStaged();
    const { event } = revealPin(data, 'ps', 'The vault doors stand open.');
    const history = data.events
      .filter((e) => e.pinId === 'ps')
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    expect(history.map((e) => e.id)).toEqual(['es', event.id]);
  });
});
