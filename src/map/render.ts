// Map rendering: the campaign map image plus its pins, filtered to a session
// (the scrubber's clock). Re-renders wholesale, Fragments-style — the
// Viewport re-applies its transform to the fresh <g class="vp"> afterwards.

import type { CampaignData, Pin } from '../model';

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
    const revealed = p.hiddenUntilSession === undefined || p.hiddenUntilSession <= session;
    const hasEvents = data.events.some((e) => e.pinId === p.id && e.session <= session);
    return revealed && hasEvents;
  });
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
    const revealed = p.hiddenUntilSession === undefined || p.hiddenUntilSession <= session;
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

  for (const pin of [...visiblePins(data, view.session), ...ghosts]) {
    const isGhost = ghostIds.has(pin.id);
    // data arrives seat-filtered from the server: any mark present is yours to see
    const events = data.events.filter((e) => e.pinId === pin.id && e.session <= view.session);
    const eventIds = new Set(events.map((e) => e.id));
    const marks = data.testimony.filter((t) => t.markText && eventIds.has(t.eventId) && t.session <= view.session);

    const pg = document.createElementNS(SVG_NS, 'g');
    pg.setAttribute('class', 'pin' + (isGhost ? ' ghost' : '') + (pin.id === view.selectedPinId ? ' selected' : ''));
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

    if (!isGhost) {
      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('class', 'pin-halo');
      // a site deepens as events accumulate: the halo grows with lineage
      halo.setAttribute('r', String(14 + (events.length - 1) * 6));
      pg.appendChild(halo);
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

    g.appendChild(pg);
  }

  host.replaceChildren(svg);
}
