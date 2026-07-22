// Map rendering: the campaign map image plus its pins, filtered to a session
// (the scrubber's clock). Re-renders wholesale, Fragments-style — the
// Viewport re-applies its transform to the fresh <g class="vp"> afterwards.

import type { CampaignData, Pin, Testimony } from '../model';
import { eventParticipants } from '../mutations';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface MapView {
  /** Pins visible at this session, with their accumulated-event counts. */
  session: number;
  selectedPinId: string | null;
  /** Owner at the present: also render event-less pins, ghosted. */
  withGhosts?: boolean;
}

export function visiblePins(data: CampaignData, session: number): Pin[] {
  return data.pins.filter((p) => {
    const revealed = !p.hidden && (p.hiddenUntilSession === undefined || p.hiddenUntilSession <= session);
    const hasEvents = data.events.some((e) => e.pinId === p.id && e.session <= session);
    return revealed && hasEvents;
  });
}

/**
 * Staged pins — the owner's secret layer. Players never receive them (the
 * server strips them from the payload); for the owner they render veiled,
 * at the present only, alongside the ghosts.
 */
export function stagedPins(data: CampaignData): Pin[] {
  return data.pins.filter((p) => p.hidden === true);
}

/**
 * A site's heartbeat at the viewed session: how recently something happened
 * here, and whose voices are still missing from it. This is what makes a pin
 * read as alive at a glance — recency and open testimony slots derive from
 * the session stamps, no schema of their own (V1 requirement 1). Computed
 * against the *viewed* session, so scrubbing back replays the illumination:
 * the map as of session 2 glows where session 2 was happening.
 */
export interface PinPulse {
  /** Session of the site's latest event at the viewed session. */
  latestSession: number;
  /** Sessions since something happened here: 0 = happening now. */
  age: number;
  /** Testimony slots on the latest session's events (seat-filtered: a withheld entry reads as open). */
  filled: number;
  total: number;
}

export function pinPulse(data: CampaignData, pinId: string, session: number): PinPulse | null {
  const events = data.events.filter((e) => e.pinId === pinId && e.session <= session);
  if (events.length === 0) return null;
  const latestSession = Math.max(...events.map((e) => e.session));
  let filled = 0;
  let total = 0;
  for (const e of events) {
    if (e.session !== latestSession) continue;
    const participants = eventParticipants(data, e);
    total += participants.length;
    filled += participants.filter((id) => data.testimony.some((t) => t.eventId === e.id && t.memberId === id)).length;
  }
  return { latestSession, age: session - latestSession, filled, total };
}

/** Illumination bucket: fresh glows, warm reads normal, settled cools toward ink. */
export function pulseClass(age: number): '' | ' fresh' | ' settled' {
  if (age === 0) return ' fresh';
  return age >= 3 ? ' settled' : '';
}

/**
 * Marks found at a site at the viewed session. A mark rides its *event's*
 * session stamp (docs/decisions.md, "Marks"): testimony may arrive late —
 * late is fine, forever — but graffiti belongs to when the thing happened,
 * so the scrubber surfaces it with its event, never with its writing date.
 */
export function siteMarks(data: CampaignData, pinId: string, session: number): Testimony[] {
  const eventIds = new Set(data.events.filter((e) => e.pinId === pinId && e.session <= session).map((e) => e.id));
  return data.testimony.filter((t) => t.markText !== undefined && eventIds.has(t.eventId));
}

/**
 * Pins with no history yet. "A site with no history has no page" holds for
 * players — but the owner who just named a place must be able to reach it
 * again to give it its first event, so to them it renders as a ghost.
 * Reveal sessions still apply; owner-side handling of deliberately hidden
 * pins is step 8's toggle, not this rule.
 */
export function ghostPins(data: CampaignData, session: number): Pin[] {
  return data.pins.filter((p) => {
    const revealed = !p.hidden && (p.hiddenUntilSession === undefined || p.hiddenUntilSession <= session);
    const hasEvents = data.events.some((e) => e.pinId === p.id && e.session <= session);
    return revealed && !hasEvents;
  });
}

export function renderMap(host: HTMLElement, data: CampaignData, view: MapView): void {
  const { mapImageUrl, mapW, mapH } = data.campaign;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map');

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'vp');
  svg.appendChild(g);

  const img = document.createElementNS(SVG_NS, 'image');
  img.setAttribute('href', mapImageUrl);
  img.setAttribute('width', String(mapW));
  img.setAttribute('height', String(mapH));
  g.appendChild(img);

  const ghosts = view.withGhosts ? ghostPins(data, view.session) : [];
  const ghostIds = new Set(ghosts.map((p) => p.id));
  const staged = view.withGhosts ? stagedPins(data) : [];
  const stagedIds = new Set(staged.map((p) => p.id));

  for (const pin of [...visiblePins(data, view.session), ...ghosts, ...staged]) {
    const isGhost = ghostIds.has(pin.id);
    const isStaged = stagedIds.has(pin.id);
    // data arrives seat-filtered from the server: any mark present is yours to see
    const events = data.events.filter((e) => e.pinId === pin.id && e.session <= view.session);
    const marks = siteMarks(data, pin.id, view.session);

    // staged pins have no pulse: they aren't alive to the table yet
    const pulse = isGhost || isStaged ? null : pinPulse(data, pin.id, view.session);
    const pg = document.createElementNS(SVG_NS, 'g');
    pg.setAttribute(
      'class',
      'pin' +
        (isStaged ? ' staged' : isGhost ? ' ghost' : pulseClass(pulse!.age)) +
        (pin.id === view.selectedPinId ? ' selected' : ''),
    );
    pg.setAttribute('data-pin-id', pin.id);
    // pin geometry is authored at a 1600px reference map; scale with the image
    const u = Math.max(mapW, mapH) / 1600;
    // ...then counter-scale by --pin-k (viewport-driven, ~1/zoom) so pins hold a
    // legible screen size at any zoom instead of shrinking to specks / ballooning.
    // A CSS transform (not the attribute) lets the var re-apply on zoom without
    // a re-render; transform-box/origin give it the attribute's clean pivot at
    // the pin's own point.
    pg.style.setProperty('transform-box', 'view-box');
    pg.style.setProperty('transform-origin', '0 0');
    pg.style.setProperty(
      'transform',
      `translate(${pin.x * mapW}px, ${pin.y * mapH}px) scale(calc(${u} * var(--pin-k, 1)))`,
    );

    const haloR = 14 + (events.length - 1) * 6;
    if (!isGhost && !isStaged) {
      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('class', 'pin-halo');
      // a site deepens as events accumulate: the halo grows with lineage
      halo.setAttribute('r', String(haloR));
      pg.appendChild(halo);
    }

    // open-slot jacks: one hollow pip per voice still missing from the latest
    // session's events — filled slots draw nothing, so a fully-told site sits
    // quiet and an untold one visibly waits. Arced above the dot, riding just
    // outside the halo so lineage growth pushes them outward with it.
    if (pulse) {
      const open = pulse.total - pulse.filled;
      const jackR = haloR + 5;
      for (let i = 0; i < open; i++) {
        const jack = document.createElementNS(SVG_NS, 'circle');
        jack.setAttribute('class', 'pin-jack');
        const a = ((-90 + (i - (open - 1) / 2) * 26) * Math.PI) / 180;
        jack.setAttribute('cx', (jackR * Math.cos(a)).toFixed(1));
        jack.setAttribute('cy', (jackR * Math.sin(a)).toFixed(1));
        jack.setAttribute('r', '3.2');
        pg.appendChild(jack);
      }
    }

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'pin-dot');
    dot.setAttribute('r', '9');
    pg.appendChild(dot);

    if (events.length > 1) {
      const n = document.createElementNS(SVG_NS, 'text');
      n.setAttribute('class', 'pin-count');
      n.setAttribute('y', '4');
      n.textContent = String(events.length);
      pg.appendChild(n);
    }

    if (marks.length > 0) {
      const scrawl = document.createElementNS(SVG_NS, 'text');
      scrawl.setAttribute('class', 'pin-scrawl');
      scrawl.setAttribute('x', '13');
      scrawl.setAttribute('y', '-10');
      scrawl.textContent = '✎';
      pg.appendChild(scrawl);
    }

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'pin-label');
    label.setAttribute('y', '32');
    label.textContent = pin.name;
    pg.appendChild(label);

    if (isStaged) {
      const tag = document.createElementNS(SVG_NS, 'text');
      tag.setAttribute('class', 'pin-staged-tag');
      tag.setAttribute('y', '46');
      tag.textContent = 'staged';
      pg.appendChild(tag);
    }

    g.appendChild(pg);
  }

  host.replaceChildren(svg);
}
