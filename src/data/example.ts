// The example table, shipped with the app. A finished stretch of campaign,
// baked in as data: no server, no seat, no join code — the walkthrough can't
// rot in production and a visitor can't leave fingerprints on it. Each pin
// is a tour stop demonstrating one mechanic; the tour copy lives here beside
// the data it points at.

import type { CampaignData } from '../model';

const at = (month: number, day: number, hour = 19): number => Date.UTC(2026, month - 1, day, hour);

export const exampleData: CampaignData = {
  campaign: {
    id: 'example',
    name: 'The Example Table',
    mapImageUrl: '/maps/example.svg',
    mapW: 1600,
    mapH: 1200,
    joinCode: '',
  },
  members: [
    { id: 'm1', campaignId: 'example', name: 'The Keeper of the Record', role: 'owner', status: 'active' },
    { id: 'm2', campaignId: 'example', name: 'Brannoc', role: 'player', status: 'active' },
    { id: 'm3', campaignId: 'example', name: 'Sister Halda', role: 'player', status: 'active' },
    { id: 'm4', campaignId: 'example', name: 'Mote', role: 'player', status: 'active' },
  ],
  pins: [
    { id: 'p1', campaignId: 'example', x: 0.52, y: 0.468, name: 'The Welcome Stone' },
    {
      id: 'p2',
      campaignId: 'example',
      x: 0.28,
      y: 0.37,
      name: 'The Salt Harbor',
      description: 'A grey little port that smells of tar and rumor. Every third rope on the quay has been cut and retied, and nobody will say by whom.',
    },
    { id: 'p3', campaignId: 'example', x: 0.664, y: 0.31, name: 'The Broken Span', sealed: true },
    { id: 'p4', campaignId: 'example', x: 0.611, y: 0.79, name: 'The Bell Under the Fen' },
  ],
  events: [
    {
      id: 'e1',
      pinId: 'p1',
      createdAt: at(5, 2),
      canonLine: 'Three strangers met at the Welcome Stone and agreed, warily, to share a map.',
      atmosphere:
        'The line above is canon — the Campaign Manager’s one-line record of what happened here. Everything under it is testimony: each seat’s own account, kept in their own words, unedited by anyone. The accounts will not agree. That is not a problem the app fixes; it is the thing the app keeps.',
      participantIds: ['m2', 'm3', 'm4'],
    },
    {
      id: 'e2',
      pinId: 'p2',
      createdAt: at(5, 9),
      canonLine: 'The Merle slipped her mooring in the night and was lost on the bar.',
      participantIds: ['m2', 'm3'],
    },
    {
      id: 'e3',
      pinId: 'p2',
      createdAt: at(5, 23),
      canonLine: 'Salvage came ashore: a figurehead no one in the harbor recognizes.',
      atmosphere: 'A newer event landing at a place closes the accounts under the older ones — each place is its own clock.',
      participantIds: ['m4', 'm2'],
    },
    {
      id: 'e4',
      pinId: 'p3',
      createdAt: at(5, 30),
      canonLine: 'The old span cracked and dropped its middle arch into the gorge.',
      atmosphere:
        'The Campaign Manager has sealed this place: the crossing is gone, and nothing new lands here. Everything already written stays readable forever.',
      participantIds: ['m2', 'm3'],
    },
    {
      id: 'e5',
      pinId: 'p4',
      createdAt: at(6, 13),
      canonLine: 'Something under the fen answered the third bell.',
      atmosphere:
        'The freshest place in a campaign breathes on the map. Hollow pips are the voices still missing from its latest event — every seat that was there owes the record an account, in their own time.',
      participantIds: [],
    },
  ],
  testimony: [
    {
      id: 't1',
      eventId: 'e1',
      memberId: 'm2',
      createdAt: at(5, 2, 21),
      text: 'I reached the stone first and lit the fire that brought the other two out of the dark. Whatever the little one says, my hand was on the map before any bargain was struck.',
    },
    {
      id: 't2',
      eventId: 'e1',
      memberId: 'm3',
      createdAt: at(5, 2, 22),
      text: 'Three of us met at the stone at dusk. For the record: the fire was mine, banked from a coal I carried down out of the fells. Brannoc arrived to a warmth he now calls his own.',
    },
    {
      id: 't3',
      eventId: 'e1',
      memberId: 'm4',
      createdAt: at(5, 3, 9),
      text: 'There were four at the stone, if you count the one watching from the grass. Nobody else counts them. I do.',
      markText: 'There were four at the stone. I counted.',
    },
    {
      id: 't4',
      eventId: 'e2',
      memberId: 'm2',
      createdAt: at(5, 9, 21),
      text: 'The Merle’s mooring rope was cut — I pulled the end out of the water myself, and no fray in the world leaves a face that clean. Someone wanted her lost on the bar.',
      markText: 'The Merle’s rope was cut clean. No storm did that.',
    },
    {
      id: 't5',
      eventId: 'e2',
      memberId: 'm3',
      createdAt: at(5, 10, 8),
      text: 'I keep the harbor ledger and I kept the rope. The strands are combed out like old hair — that is wear, not a blade. The Merle was lost to a bad knot and a worse tide.',
      markText: 'No knife touched that rope.',
    },
    {
      id: 't6',
      eventId: 'e3',
      memberId: 'm4',
      createdAt: at(5, 23, 23),
      text: 'The figurehead came up with the morning tide, a woman’s face with the paint boiled off. The harbormaster had it under sailcloth before most of the town was awake. I looked under the cloth. I wish I had not.',
    },
    {
      id: 't7',
      eventId: 'e4',
      memberId: 'm2',
      createdAt: at(5, 30, 22),
      text: 'The middle arch went into the gorge an hour after we crossed it. I am not saying the bridge waited for us. I am saying the timing was polite.',
    },
    {
      id: 't8',
      eventId: 'e4',
      memberId: 'm3',
      createdAt: at(5, 31, 8),
      text: 'Stone that has stood four hundred years does not fall on a windless evening. I wrote down the sound it made as it went. There is no word for it, so I have invented one.',
    },
    {
      id: 't9',
      eventId: 'e5',
      memberId: 'm3',
      createdAt: at(6, 13, 22),
      text: 'We rang the old bell three times, as the ferryman’s rhyme says to. The third ring was answered from under the mere — one note, deeper than ours, and the water did not ripple. I am done doubting the rhyme.',
    },
  ],
  bounties: [
    {
      id: 'b1',
      campaignId: 'example',
      postedBy: 'm2',
      target: 'The rope-cutter of the Salt Harbor',
      reason: 'The Merle’s rope was cut and my cousin was aboard her. Whoever holds the knife owes me a boat and an answer, and I mean to collect both.',
      postedAt: at(5, 10),
      status: 'posted',
    },
    {
      id: 'b2',
      campaignId: 'example',
      postedBy: 'm4',
      target: 'Whoever watched us from the grass at the Welcome Stone',
      reason: 'I counted four at the stone and I dislike being the only one who knows it. Show me the fourth, or show me I dreamt them.',
      postedAt: at(5, 3),
      status: 'struck',
      struckAt: at(5, 30),
    },
  ],
};

/** One walkthrough stop per pin: a teaser for the tour list, a fuller note
 * shown above the place's record when the stop is open. */
export interface TourStop {
  pinId: string;
  teaser: string;
  note: string;
}

export const tourStops: TourStop[] = [
  {
    pinId: 'p1',
    teaser: 'canon and testimony — one line of record, many voices under it',
    note: 'The Campaign Manager writes one line of canon per event: what happened. Each player then writes their own account of it, in their own words, and nobody — not even the Campaign Manager — edits anyone else’s. Read the three accounts of this meeting: they already disagree about the fire.',
  },
  {
    pinId: 'p2',
    teaser: 'contradiction, graffiti, and each place keeping its own clock',
    note: 'Two players highlighted a line of their account as graffiti on this place — both about the same rope, both certain, both wrong or right. And notice the older accounts read as locked: when a newer event lands at a place, the accounts under the older ones close for good. A place’s own history is its clock.',
  },
  {
    pinId: 'p3',
    teaser: 'a sealed place — readable forever, closed to new words',
    note: 'When a place closes off in the fiction, the Campaign Manager can seal its pin: everything written here stays readable, but no new accounts or graffiti land until it’s unsealed. The chain glyph on the map marks it.',
  },
  {
    pinId: 'p4',
    teaser: 'the live edge — hollow pips are voices still missing',
    note: 'The freshest place in the campaign breathes on the map, and the hollow pips arced over its pin are the voices still missing from its latest event. Only Sister Halda has written here so far; at a real table, this is where you’d write yours.',
  },
];
