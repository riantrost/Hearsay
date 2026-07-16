// Dev seed: a small Frostgrave-flavored campaign exercising the full shape —
// a pin with two events (lineage), site canon accreted from history, and a
// mark that may or may not be telling the truth.

import type { CampaignData } from '../model';

export const seed: CampaignData = {
  campaign: {
    id: 'c1',
    name: 'The Northmarch',
    // Lawrence's map (shared 2026-07-16 for the prototype)
    mapImageUrl: '/maps/northmarch.jpg',
    mapW: 5161,
    mapH: 7216,
    currentSession: 4,
  },
  members: [
    { id: 'm1', name: 'Rian', role: 'owner' },
    { id: 'm2', name: 'Vex', role: 'player' },
    { id: 'm3', name: 'Ossian', role: 'player' },
  ],
  pins: [
    { id: 'p1', x: 0.38, y: 0.27, name: 'The Old Keep' },
    { id: 'p2', x: 0.07, y: 0.78, name: 'The Shattered Span' },
    { id: 'p3', x: 0.85, y: 0.6, name: 'The White Tower', hiddenUntilSession: 3 },
    { id: 'p4', x: 0.33, y: 0.43, name: 'The Drowned Fen' },
  ],
  siteCanon: [
    { id: 'sc1', pinId: 'p2', session: 1, line: 'A soldier of the Red Company lies unburied at the bridge foot, sword still drawn.' },
    { id: 'sc2', pinId: 'p2', session: 3, line: 'The corpse is picked clean now. Something dragged it halfway to the ice.' },
  ],
  events: [
    { id: 'e1', pinId: 'p2', session: 1, canonLine: 'First blood at the broken bridge — both warbands reached the span at dusk.', participantIds: ['m2', 'm3'] },
    { id: 'e2', pinId: 'p2', session: 3, canonLine: 'Return to the span: the treasure sighted under the ice was bait.', participantIds: ['m2', 'm3'] },
    { id: 'e3', pinId: 'p1', session: 2, canonLine: 'The reliquary door opened for the first time in a thousand years.', participantIds: ['m2'] },
    { id: 'e4', pinId: 'p4', session: 4, canonLine: 'Something under the Drowned Fen answered the third bell.', participantIds: ['m2', 'm3'] },
  ],
  testimony: [
    { id: 't1', eventId: 'e1', memberId: 'm2', session: 1, text: 'We had the span before their scouts even crossed the ice. Whatever Ossian claims, his archer loosed first — my apprentice carries the scar.' },
    { id: 't2', eventId: 'e1', memberId: 'm3', session: 1, text: 'Vex speaks of ambush as if she did not hold the high stones before dusk. We loosed second. The dead soldier at the bridge foot was none of ours.' },
    { id: 't3', eventId: 'e2', memberId: 'm2', session: 3, text: 'The gleam under the ice was a lure — a lantern in a drowned hand. We lost Brann to the cold water. I marked the span so no one else follows it.' },
    { id: 't4', eventId: 'e3', memberId: 'm2', session: 2, text: 'The door knew my voice. I have told no one what was written inside the reliquary lid.' },
  ],
  marks: [
    { id: 'k1', testimonyId: 't3', pinId: 'p2', session: 3, text: 'The light under the ice is a lie. Turn back.' },
    { id: 'k2', testimonyId: 't2', pinId: 'p2', session: 1, text: 'The dead soldier was none of ours.' },
  ],
};
