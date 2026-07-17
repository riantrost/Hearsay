// The pin surface: a site's lineage, read top to bottom — marks found first
// (graffiti, unattributed at a glance), then site canon, then events in
// session order with testimony. When viewing the present, it is also the
// write surface: open slots take words, your fresh entries stay editable
// until the table's clock closes them, and the owner accretes canon.

import type { CampaignData } from '../model';
import { MARK_MAX_CHARS } from '../model';
import type { Store } from '../store';

export interface SurfaceContext {
  store: Store;
  pinId: string;
  session: number;
  viewerId: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A one-line input with a button; onSubmit gets the trimmed value. */
function lineForm(placeholder: string, button: string, onSubmit: (value: string) => void, maxLength?: number): HTMLFormElement {
  const form = el('form', 'line-form');
  const input = el('input');
  input.placeholder = placeholder;
  if (maxLength) input.maxLength = maxLength;
  const btn = el('button', undefined, button);
  form.append(input, btn);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = input.value.trim();
    if (v) onSubmit(v);
  });
  return form;
}

export function renderPinSurface(host: HTMLElement, ctx: SurfaceContext): void {
  const { store, pinId, session, viewerId } = ctx;
  const data: CampaignData = store.data;
  const pin = data.pins.find((p) => p.id === pinId);
  if (!pin) {
    host.replaceChildren();
    host.hidden = true;
    return;
  }
  host.hidden = false;

  const viewer = data.members.find((m) => m.id === viewerId);
  const isOwner = viewer?.role === 'owner';
  // the past is read-only: writing happens only at the table's current session
  const writable = session === data.campaign.currentSession;

  const events = data.events
    .filter((e) => e.pinId === pinId && e.session <= session)
    .sort((a, b) => a.session - b.session);
  const canon = data.siteCanon.filter((c) => c.pinId === pinId && c.session <= session);
  const marks = data.marks.filter((m) => m.pinId === pinId && m.session <= session);

  const frag = document.createDocumentFragment();
  frag.appendChild(el('h2', undefined, pin.name));

  // marks first: what you find scrawled at the site before you know its story
  for (const mark of marks) {
    frag.appendChild(el('p', 'mark', `someone scrawled here: “${mark.text}”`));
  }

  for (const line of canon) {
    frag.appendChild(el('p', 'site-canon', line.line));
  }
  if (isOwner && writable) {
    frag.appendChild(lineForm('the environment remembers…', 'set down', (v) => store.addSiteCanon(pinId, v)));
  }

  for (const event of events) {
    const sec = el('section', 'event');
    sec.appendChild(el('h3', undefined, `Session ${event.session}`));
    sec.appendChild(el('p', 'event-canon', event.canonLine));

    for (const memberId of event.participantIds) {
      const member = data.members.find((m) => m.id === memberId);
      const entry = data.testimony.find((t) => t.eventId === event.id && t.memberId === memberId);
      const mine = memberId === viewerId;

      const t = el('div', 'testimony' + (entry ? '' : ' empty'));
      t.appendChild(el('span', 'testimony-author', member?.name ?? '?'));

      if (entry && mine && writable && store.canEdit(entry)) {
        // still in the grace window: the author may amend
        const area = el('textarea');
        area.value = entry.text;
        const save = el('button', undefined, 'amend');
        save.addEventListener('click', () => {
          if (area.value.trim()) store.writeTestimony(event.id, memberId, area.value.trim());
        });
        const hint = el('p', 'grace-hint', 'open until the next session begins');
        t.append(area, save, hint);
        if (!data.marks.some((m) => m.testimonyId === entry.id)) {
          t.appendChild(
            lineForm(`leave a mark on this place (${MARK_MAX_CHARS} chars)`, 'scrawl', (v) => {
              try {
                store.promoteMark(entry.id, memberId, v);
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              }
            }, MARK_MAX_CHARS),
          );
        }
      } else if (entry) {
        t.appendChild(el('p', undefined, entry.text));
      } else if (mine && writable) {
        const area = el('textarea');
        area.placeholder = 'what happened here, as you remember it';
        const save = el('button', undefined, 'testify');
        save.addEventListener('click', () => {
          if (area.value.trim()) store.writeTestimony(event.id, memberId, area.value.trim());
        });
        t.append(area, save);
      } else {
        t.appendChild(el('p', undefined, 'an open slot, quietly waiting'));
      }
      sec.appendChild(t);
    }
    frag.appendChild(sec);
  }

  if (isOwner && writable) {
    const add = el('section', 'add-event');
    add.appendChild(el('h3', undefined, `New event · Session ${data.campaign.currentSession}`));
    add.appendChild(lineForm('one line of canon: what happened here', 'drop it', (v) => store.addEvent(pinId, v)));
    frag.appendChild(add);
  }

  host.replaceChildren(frag);
}
