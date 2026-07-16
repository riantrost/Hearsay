// The pin surface: a site's lineage, read top to bottom — marks found first
// (graffiti, unattributed at a glance), then events in session order, each
// with its canon line and testimony. Site canon interleaves at its session.

import type { CampaignData } from '../model';

export function renderPinSurface(host: HTMLElement, data: CampaignData, pinId: string, session: number): void {
  const pin = data.pins.find((p) => p.id === pinId);
  if (!pin) {
    host.replaceChildren();
    host.hidden = true;
    return;
  }
  host.hidden = false;

  const events = data.events
    .filter((e) => e.pinId === pinId && e.session <= session)
    .sort((a, b) => a.session - b.session);
  const canon = data.siteCanon.filter((c) => c.pinId === pinId && c.session <= session);
  const marks = data.marks.filter((m) => m.pinId === pinId && m.session <= session);

  const frag = document.createDocumentFragment();

  const h = document.createElement('h2');
  h.textContent = pin.name;
  frag.appendChild(h);

  // marks first: what you find scrawled at the site before you know its story
  for (const mark of marks) {
    const el = document.createElement('p');
    el.className = 'mark';
    el.textContent = `someone scrawled here: “${mark.text}”`;
    frag.appendChild(el);
  }

  for (const line of canon) {
    const el = document.createElement('p');
    el.className = 'site-canon';
    el.textContent = line.line;
    frag.appendChild(el);
  }

  for (const event of events) {
    const sec = document.createElement('section');
    sec.className = 'event';

    const head = document.createElement('h3');
    head.textContent = `Session ${event.session}`;
    sec.appendChild(head);

    const canonLine = document.createElement('p');
    canonLine.className = 'event-canon';
    canonLine.textContent = event.canonLine;
    sec.appendChild(canonLine);

    for (const memberId of event.participantIds) {
      const member = data.members.find((m) => m.id === memberId);
      const entry = data.testimony.find((t) => t.eventId === event.id && t.memberId === memberId);
      const t = document.createElement('div');
      t.className = 'testimony' + (entry ? '' : ' empty');
      const who = document.createElement('span');
      who.className = 'testimony-author';
      who.textContent = member?.name ?? '?';
      t.appendChild(who);
      const body = document.createElement('p');
      body.textContent = entry ? entry.text : 'an open slot, quietly waiting';
      t.appendChild(body);
      sec.appendChild(t);
    }

    frag.appendChild(sec);
  }

  host.replaceChildren(frag);
}
