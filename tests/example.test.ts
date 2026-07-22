// The example table ships as data, so its integrity is a build contract:
// a broken reference here is a broken walkthrough on the front door.

import { describe, expect, it } from 'vitest';
import { exampleData, tourStops } from '../src/data/example';
import { pinPulse, pulseClass, siteMarks, visiblePins } from '../src/derive';
import { MARK_MAX_CHARS, MAX_BOUNTY_REASON_CHARS } from '../src/model';
import { eventParticipants } from '../src/mutations';

describe('the example table', () => {
  it('is referentially whole: every event, account, and bounty resolves', () => {
    const memberIds = new Set(exampleData.members.map((m) => m.id));
    const pinIds = new Set(exampleData.pins.map((p) => p.id));
    const eventIds = new Set(exampleData.events.map((e) => e.id));
    for (const e of exampleData.events) {
      expect(pinIds.has(e.pinId)).toBe(true);
      for (const id of e.participantIds) expect(memberIds.has(id)).toBe(true);
    }
    for (const t of exampleData.testimony) {
      expect(eventIds.has(t.eventId)).toBe(true);
      expect(memberIds.has(t.memberId)).toBe(true);
      // every account belongs to a slot its event actually grants
      const event = exampleData.events.find((e) => e.id === t.eventId)!;
      expect(eventParticipants(exampleData, event)).toContain(t.memberId);
    }
    for (const b of exampleData.bounties) {
      expect(memberIds.has(b.postedBy)).toBe(true);
      expect(b.reason.length).toBeLessThanOrEqual(MAX_BOUNTY_REASON_CHARS);
    }
  });

  it('every tour stop points at a visible pin', () => {
    const visible = new Set(visiblePins(exampleData).map((p) => p.id));
    for (const stop of tourStops) expect(visible.has(stop.pinId)).toBe(true);
    // and the tour covers every pin — no place on the example map goes untaught
    expect(tourStops.length).toBe(exampleData.pins.length);
  });

  it('stages the illumination it teaches: the fen is fresh with missing voices, the span sealed', () => {
    const fen = pinPulse(exampleData, 'p4')!;
    expect(pulseClass(fen.gap)).toBe(' fresh');
    expect(fen.total - fen.filled).toBe(3); // the Keeper, Brannoc, and Mote still owe accounts
    expect(exampleData.pins.find((p) => p.id === 'p3')!.sealed).toBe(true);
    // the harbor carries the contradicting graffiti the tour points at
    expect(siteMarks(exampleData, 'p2').length).toBe(2);
    for (const t of exampleData.testimony) {
      if (t.markText !== undefined) expect(t.markText.length).toBeLessThanOrEqual(MARK_MAX_CHARS);
    }
  });
});
