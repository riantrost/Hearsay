// Recency illumination is derived, never stored: a pin's aliveness is its
// latest event measured against the campaign's own newest event — never
// wall-clock now, so an idle month freezes the map in its last illumination
// instead of dimming everything (every system survives a low-energy month).
// Open-slot jacks come from the same pulse — the voices still missing from
// the site's latest burst. (V1 requirement 1: recent activity at a glance.)

import { describe, expect, it } from 'vitest';
import { FRESH_WINDOW_MS, SETTLED_GAP_MS, pinPulse, pulseClass } from '../src/derive';
import { DAY, HOUR, night, seed } from '../src/data/seed';

describe('pinPulse', () => {
  it('is null where nothing has happened — a ghost has no heartbeat', () => {
    expect(pinPulse(seed, 'p3')).toBeNull();
  });

  it('measures the gap against the campaign\'s newest event, not the calendar', () => {
    // the campaign's newest event is e4 (night 4)
    expect(pinPulse(seed, 'p2')).toMatchObject({ latestAt: night(3), gap: DAY });
    expect(pinPulse(seed, 'p1')).toMatchObject({ latestAt: night(2), gap: 2 * DAY });
    // p4 is where it's happening
    expect(pinPulse(seed, 'p4')).toMatchObject({ latestAt: night(4), gap: 0 });
  });

  it('holds its shape under a uniform shift — the anchor is the campaign, never now', () => {
    const shifted = structuredClone(seed);
    for (const e of shifted.events) e.createdAt -= 30 * DAY;
    for (const t of shifted.testimony) t.createdAt -= 30 * DAY;
    expect(pinPulse(shifted, 'p2')?.gap).toBe(DAY);
    expect(pinPulse(shifted, 'p4')?.gap).toBe(0);
  });

  it('counts testimony slots on the latest burst only — old completeness is not map signal', () => {
    // p2's latest burst is e2 alone: slots m2+m3, only m2 (t3) has told
    expect(pinPulse(seed, 'p2')).toMatchObject({ filled: 1, total: 2 });
    // p4's fresh event: three slots, only Thistle's (t5) written
    expect(pinPulse(seed, 'p4')).toMatchObject({ filled: 1, total: 3 });
  });

  it('aggregates slots across events within one evening of the site\'s newest', () => {
    const data = structuredClone(seed);
    data.events.push({ id: 'e5', pinId: 'p4', createdAt: night(4) + 2 * HOUR, canonLine: 'A second bell.', participantIds: ['m2'] });
    expect(pinPulse(data, 'p4')).toMatchObject({ filled: 1, total: 4 });
  });

  it('leaves an older visit out of the burst — a return night stands alone', () => {
    const data = structuredClone(seed);
    // a return to the fen a week later: the new burst is just this event
    data.events.push({ id: 'e6', pinId: 'p4', createdAt: night(4) + 7 * DAY, canonLine: 'The bell again.', participantIds: ['m2'] });
    expect(pinPulse(data, 'p4')).toMatchObject({ latestAt: night(4) + 7 * DAY, filled: 0, total: 1 });
  });

  it('reads seat-filtered data honestly: a withheld entry is an open slot', () => {
    // a player seat never receives pending Thistle's t5 — the slot reads open
    const filtered = structuredClone(seed);
    filtered.testimony = filtered.testimony.filter((t) => t.id !== 't5');
    expect(pinPulse(filtered, 'p4')).toMatchObject({ filled: 0, total: 3 });
  });
});

describe('pulseClass', () => {
  it('buckets: tonight glows, a recent night reads normal, three quiet weeks cool to ink', () => {
    expect(pulseClass(0)).toBe(' fresh');
    expect(pulseClass(FRESH_WINDOW_MS)).toBe(' fresh');
    expect(pulseClass(DAY)).toBe('');
    expect(pulseClass(SETTLED_GAP_MS - 1)).toBe('');
    expect(pulseClass(SETTLED_GAP_MS)).toBe(' settled');
    expect(pulseClass(90 * DAY)).toBe(' settled');
  });

  it('a long-quiet site cools while the newest keeps its glow', () => {
    const data = structuredClone(seed);
    // the table returns to the fen after a long winter
    data.events.push({ id: 'e7', pinId: 'p4', createdAt: night(4) + 40 * DAY, canonLine: 'Spring at the fen.', participantIds: [] });
    expect(pulseClass(pinPulse(data, 'p4')!.gap)).toBe(' fresh');
    expect(pulseClass(pinPulse(data, 'p2')!.gap)).toBe(' settled'); // 41 days behind
  });
});
