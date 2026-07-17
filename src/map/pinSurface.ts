// The pin surface: a site's lineage, read top to bottom — marks found first
// (graffiti, unattributed at a glance), then events in session order with
// testimony. When viewing the present, it is also the write surface: open
// slots take words, your fresh entries stay editable until the table's clock
// closes them. Visibility is the server's job: data arrives already shaped
// to the viewer's seat, so a withheld entry simply reads as an open slot.

import type { ApiStore } from '../apiStore';
import type { CampaignData } from '../model';
import { MARK_MAX_CHARS } from '../model';

export interface SurfaceContext {
  store: ApiStore;
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

const oops = (e: unknown) => alert(e instanceof Error ? e.message : String(e));

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

  const isOwner = store.me?.role === 'owner';
  // the past is read-only: writing happens only at the table's current session
  const writable = session === data.campaign.currentSession;

  const events = data.events
    .filter((e) => e.pinId === pinId && e.session <= session)
    .sort((a, b) => a.session - b.session);
  const eventIds = new Set(events.map((e) => e.id));
  const marks = data.testimony.filter((t) => t.markText && eventIds.has(t.eventId) && t.session <= session);

  const frag = document.createDocumentFragment();
  frag.appendChild(el('h2', undefined, pin.name));

  if (events.length === 0 && isOwner) {
    frag.appendChild(el('p', 'ghost-hint', 'no history here yet — the first event makes this place real to the table'));
  }

  // marks first: what you find scrawled at the site before you know its story
  for (const mark of marks) {
    frag.appendChild(el('p', 'mark', `someone scrawled here: “${mark.markText}”`));
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
          if (area.value.trim()) store.writeTestimony(event.id, area.value.trim()).catch(oops);
        });
        const hint = el('p', 'grace-hint', 'open until the next session begins');
        t.append(area, save, hint);
        if (!entry.markText) {
          t.appendChild(
            lineForm(`leave a mark on this place (${MARK_MAX_CHARS} chars)`, 'scrawl', (v) => {
              store.promoteMark(entry.id, v).catch(oops);
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
          if (area.value.trim()) store.writeTestimony(event.id, area.value.trim()).catch(oops);
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
    add.appendChild(lineForm('one line of canon: what happened here', 'drop it', (v) => {
      store.addEvent(pinId, v).catch(oops);
    }));
    frag.appendChild(add);
  }

  host.replaceChildren(frag);
}
