// Core data shapes, post pin/event split (docs/decisions.md): a Pin is a
// place; SiteEvents accumulate at it. Everything below Campaign carries a
// session stamp — that column is the scrubber.

export interface Campaign {
  id: string;
  name: string;
  mapImageUrl: string;
  /** Natural size of the map image; pins live in [0,1] normalized coords. */
  mapW: number;
  mapH: number;
  currentSession: number;
}

export interface Member {
  id: string;
  name: string;
  role: 'owner' | 'player';
}

export interface Pin {
  id: string;
  /** Normalized [0,1] position on the map image. */
  x: number;
  y: number;
  name: string;
  /** Session the pin was revealed; undefined = visible from the start. */
  hiddenUntilSession?: number;
}

/** One line the environment remembers, owner-authored, append-only. */
export interface SiteCanon {
  id: string;
  pinId: string;
  session: number;
  line: string;
}

/** Named SiteEvent to stay clear of the DOM's Event. */
export interface SiteEvent {
  id: string;
  pinId: string;
  session: number;
  canonLine: string;
  participantIds: string[];
}

export interface Testimony {
  id: string;
  eventId: string;
  memberId: string;
  session: number;
  text: string;
}

/** One line of testimony promoted to graffiti on the pin. */
export interface Mark {
  id: string;
  testimonyId: string;
  pinId: string;
  session: number;
  text: string;
}

export const MARK_MAX_CHARS = 100;

export interface CampaignData {
  campaign: Campaign;
  members: Member[];
  pins: Pin[];
  siteCanon: SiteCanon[];
  events: SiteEvent[];
  testimony: Testimony[];
  marks: Mark[];
}
