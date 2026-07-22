// Dev seed: a small Frostgrave-flavored campaign exercising the full shape —
// a pin with two events (lineage), marks that may or may not be telling the
// truth, and a pending member whose words only they and the owner can see.
// Timestamps are fixed epoch-ms constants, day-spaced to keep the original
// four-night narrative order deterministic for the tests.

import type { CampaignData } from '../model';

/** Seed clock: four play-nights, a day apart. Exported for the tests. */
export const T0 = 1750000000000;
export const DAY = 86400000;
export const HOUR = 3600000;
/** The nth play-night (1-based, matching the old session numbers). */
export const night = (n: number) => T0 + n * DAY;

export const seed: CampaignData = {
  campaign: {
    id: 'c1',
    name: 'The Northmarch',
    // Lawrence's map (shared 2026-07-16 for the prototype)
    mapImageUrl: '/maps/northmarch.jpg',
    mapW: 5161,
    mapH: 7216,
    joinCode: 'NORTHMARCH',
  },
  members: [
    { id: 'm1', campaignId: 'c1', name: 'Rian', role: 'owner', status: 'active' },
    { id: 'm2', campaignId: 'c1', name: 'Vex', role: 'player', status: 'active' },
    { id: 'm3', campaignId: 'c1', name: 'Ossian', role: 'player', status: 'active' },
    { id: 'm4', campaignId: 'c1', name: 'Thistle', role: 'player', status: 'pending' },
  ],
  pins: [
    {
      id: 'p1',
      campaignId: 'c1',
      x: 0.38,
      y: 0.27,
      name: 'The Old Keep',
      description: 'A reliquary keep older than the frost. Its door has opened exactly once in living memory.',
    },
    { id: 'p2', campaignId: 'c1', x: 0.07, y: 0.78, name: 'The Shattered Span' },
    { id: 'p3', campaignId: 'c1', x: 0.85, y: 0.6, name: 'The White Tower' },
    { id: 'p4', campaignId: 'c1', x: 0.33, y: 0.43, name: 'The Drowned Fen' },
  ],
  events: [
    { id: 'e1', pinId: 'p2', createdAt: night(1), canonLine: 'First blood at the broken bridge — both warbands reached the span at dusk.', participantIds: ['m2', 'm3'] },
    { id: 'e2', pinId: 'p2', createdAt: night(3), canonLine: 'Return to the span: the treasure sighted under the ice was bait.', participantIds: ['m2', 'm3'] },
    { id: 'e3', pinId: 'p1', createdAt: night(2), canonLine: 'The reliquary door opened for the first time in a thousand years.', participantIds: ['m2'] },
    { id: 'e4', pinId: 'p4', createdAt: night(4), canonLine: 'Something under the Drowned Fen answered the third bell.', participantIds: ['m2', 'm3', 'm4'] },
  ],
  testimony: [
    { id: 't1', eventId: 'e1', memberId: 'm2', createdAt: night(1) + HOUR, text: 'We had the span before their scouts even crossed the ice. Whatever Ossian claims, his archer loosed first — my apprentice carries the scar.' },
    { id: 't2', eventId: 'e1', memberId: 'm3', createdAt: night(1) + 2 * HOUR, text: 'Vex speaks of ambush as if she did not hold the high stones before dusk. We loosed second. The dead soldier at the bridge foot was none of ours.', markText: 'The dead soldier was none of ours.' },
    { id: 't3', eventId: 'e2', memberId: 'm2', createdAt: night(3) + HOUR, text: 'The gleam under the ice was a lure — a lantern in a drowned hand. We lost Brann to the cold water. I marked the span so no one else follows it.', markText: 'The light under the ice is a lie. Turn back.' },
    { id: 't4', eventId: 'e3', memberId: 'm2', createdAt: night(2) + HOUR, text: 'The door knew my voice. I have told no one what was written inside the reliquary lid.' },
    // a pending member's words: visible only to Thistle and the owner
    { id: 't5', eventId: 'e4', memberId: 'm4', createdAt: night(4) + HOUR, text: 'I heard the bell too, from the reeds where I was hiding. It rang three times before anyone else arrived. I counted.' },
  ],
  bounties: [
    // posted: on the board for the whole table
    { id: 'b1', campaignId: 'c1', postedBy: 'm2', target: "Ossian's archer", postedAt: night(3) + 2 * HOUR, status: 'posted', reason: 'Brann drowned under the span chasing a light your archer swore was treasure. Fifty crowns of my own for the bow that lied.' },
    // proposed: awaiting the owner's nail — only Ossian and the owner see it
    { id: 'b2', campaignId: 'c1', postedBy: 'm3', target: 'The bell-ringer of the Drowned Fen', postedAt: night(4) + 2 * HOUR, status: 'proposed', reason: 'Whatever answered the third bell took my best soldier under the water. I want proof it can die.' },
    // struck: settled on the third night, crossed out but never erased
    { id: 'b3', campaignId: 'c1', postedBy: 'm3', target: 'The lantern-keeper under the ice', postedAt: night(1) + 3 * HOUR, status: 'struck', struckAt: night(3) + 3 * HOUR, reason: 'For the scar my apprentice carries from the span. Settled the day the ice took its lantern back.' },
  ],
};
