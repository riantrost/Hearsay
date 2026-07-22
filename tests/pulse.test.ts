// Recency illumination is derived, never stored: a pin's aliveness comes
// from its latest event's session stamp measured against the *viewed*
// session, so the scrubber replays the glow. Open-slot jacks come from the
// same pulse — the voices still missing from the latest session's events.
// (V1 requirement 1: recent activity visible on the map at a glance.)

import { describe, expect, it } from 'vitest';
import { pinPulse, pulseClass } from '../src/derive';
import { seed } from '../src/data/seed';

describe('pinPulse', () => {
  it('is null where nothing has happened — a ghost has no heartbeat', () => {
    expect(pinPulse(seed, 'p3', 4)).toBeNull();
  });

  it('measures age against the viewed session, not the calendar', () => {
    // p2's latest event is session 3: one session old at the present (s4)
    expect(pinPulse(seed, 'p2', 4)).toMatchObject({ latestSession: 3, age: 1 });
    // p1's only event is session 2
    expect(pinPulse(seed, 'p1', 4)).toMatchObject({ latestSession: 2, age: 2 });
    // p4 stirred this very session
    expect(pinPulse(seed, 'p4', 4)).toMatchObject({ latestSession: 4, age: 0 });
  });

  it('replays under the scrubber: the map as of session 3 glows where session 3 happened', () => {
    expect(pinPulse(seed, 'p2', 3)).toMatchObject({ latestSession: 3, age: 0 });
    // scrubbed before its second event, p2's pulse comes from session 1
    expect(pinPulse(seed, 'p2', 2)).toMatchObject({ latestSession: 1, age: 1 });
  });

  it('counts testimony slots on the latest session only — old completeness is not map signal', () => {
    // p2 at s4: latest event e2 has slots m2+m3, only m2 (t3) has told
    expect(pinPulse(seed, 'p2', 4)).toMatchObject({ filled: 1, total: 2 });
    // scrubbed to s2, the latest is e1 where both voices are in
    expect(pinPulse(seed, 'p2', 2)).toMatchObject({ filled: 2, total: 2 });
    // p4's fresh event: three slots, only Thistle's (t5) written
    expect(pinPulse(seed, 'p4', 4)).toMatchObject({ filled: 1, total: 3 });
  });

  it('aggregates slots across events sharing the latest session', () => {
    const data = structuredClone(seed);
    data.events.push({ id: 'e5', pinId: 'p4', session: 4, canonLine: 'A second bell.', participantIds: ['m2'] });
    expect(pinPulse(data, 'p4', 4)).toMatchObject({ filled: 1, total: 4 });
  });

  it('reads seat-filtered data honestly: a withheld entry is an open slot', () => {
    // a player seat never receives pending Thistle's t5 — the slot reads open
    const filtered = structuredClone(seed);
    filtered.testimony = filtered.testimony.filter((t) => t.id !== 't5');
    expect(pinPulse(filtered, 'p4', 4)).toMatchObject({ filled: 0, total: 3 });
  });
});

describe('pulseClass', () => {
  it('buckets: this session glows, recent reads normal, three sessions quiet cools to ink', () => {
    expect(pulseClass(0)).toBe(' fresh');
    expect(pulseClass(1)).toBe('');
    expect(pulseClass(2)).toBe('');
    expect(pulseClass(3)).toBe(' settled');
    expect(pulseClass(9)).toBe(' settled');
  });
});
