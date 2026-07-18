// The pin surface: a site's lineage, read top to bottom — marks found first
// (graffiti, unattributed at a glance), then events in session order with
// testimony. When viewing the present, it is also the write surface: open
// slots take words, your fresh entries stay editable until the table's clock
// closes them. Visibility is the server's job: data arrives already shaped
// to the viewer's seat, so a withheld entry simply reads as an open slot.
//
// Re-renders are wholesale, and the freshness poll re-renders while people
// type — so every writable field carries a draft key, and unsent words
// (plus focus and caret) survive the rebuild.

import type { ApiStore } from '../apiStore';
import type { CampaignData } from '../model';
import { MARK_MAX_CHARS } from '../model';
import { siteMarks } from './render';

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
function lineForm(placeholder: string, button: string, onSubmit: (value: string) => Promise<unknown>, maxLength?: number): HTMLFormElement {
  const form = el('form', 'line-form');
  const input = el('input');
  input.placeholder = placeholder;
  if (maxLength) input.maxLength = maxLength;
  const btn = el('button', undefined, button);
  form.append(input, btn);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    // optimistic clear: the re-render's draft harvest must not resurrect a
    // submitted line — and a refused submit puts the words back
    input.value = '';
    onSubmit(v).catch((e: unknown) => {
      input.value = v;
      oops(e);
    });
  });
  return form;
}

const oops = (e: unknown) => alert(e instanceof Error ? e.message : String(e));

interface Draft {
  value: string;
  focused: boolean;
  start: number | null;
  end: number | null;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Unsent words in the old DOM, keyed by data-draft-key. */
function harvestDrafts(host: HTMLElement): Map<string, Draft> {
  const drafts = new Map<string, Draft>();
  for (const field of host.querySelectorAll<Field>('[data-draft-key]')) {
    if (!field.value) continue;
    drafts.set(field.dataset.draftKey!, {
      value: field.value,
      focused: field === document.activeElement,
      start: field.selectionStart,
      end: field.selectionEnd,
    });
  }
  return drafts;
}

/** Put the caret back where the writer left it. */
function restoreFocus(host: HTMLElement, drafts: Map<string, Draft>): void {
  for (const field of host.querySelectorAll<Field>('[data-draft-key]')) {
    const draft = drafts.get(field.dataset.draftKey!);
    if (draft?.focused) {
      field.focus();
      if (draft.start !== null) field.setSelectionRange(draft.start, draft.end ?? draft.start);
      return;
    }
  }
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

  const drafts = harvestDrafts(host);
  const applyDraft = (field: Field, key: string, fallback = ''): void => {
    field.dataset.draftKey = key;
    field.value = drafts.get(key)?.value ?? fallback;
  };

  const isOwner = store.me?.role === 'owner';
  // the past is read-only: writing happens only at the table's current session
  const writable = session === data.campaign.currentSession;

  const events = data.events
    .filter((e) => e.pinId === pinId && e.session <= session)
    .sort((a, b) => a.session - b.session);
  // a mark rides its event's session, not its writing date (late is fine, forever)
  const marks = siteMarks(data, pinId, session);

  const frag = document.createDocumentFragment();
  frag.appendChild(el('h2', undefined, pin.name));

  // the site's lineage in one line: how long this place has been accumulating
  if (events.length > 0) {
    const first = events[0].session;
    const last = events[events.length - 1].session;
    frag.appendChild(
      el(
        'p',
        'site-line',
        events.length === 1 ? `one event · session ${first}` : `${events.length} events · sessions ${first}–${last}`,
      ),
    );
  }

  if (pin.hidden && isOwner) {
    // the staging layer: this place doesn't exist for the table — not on
    // their maps, not in their payloads. The way out is a reveal, which
    // lands as a timeline event.
    frag.appendChild(el('p', 'staged-hint', 'staged — the table cannot see this place'));
    if (writable) {
      const revealForm = lineForm('what the table now learns', 'reveal', (v) => store.revealPin(pinId, v));
      revealForm.classList.add('reveal-form');
      applyDraft(revealForm.querySelector('input')!, `reveal:${pinId}`);
      frag.appendChild(revealForm);
      if (events.length === 0 && data.events.every((e) => e.pinId !== pinId)) {
        const unstage = el('button', 'stage-toggle', 'unstage');
        unstage.addEventListener('click', () => store.setPinHidden(pinId, false).catch(oops));
        frag.appendChild(unstage);
      }
    }
  } else if (events.length === 0 && isOwner) {
    frag.appendChild(el('p', 'ghost-hint', 'no history here yet — the first event makes this place real to the table'));
    if (writable && data.events.every((e) => e.pinId !== pinId)) {
      const stage = el('button', 'stage-toggle', 'stage in secret');
      stage.title = 'the table will not see this place until you reveal it';
      stage.addEventListener('click', () => store.setPinHidden(pinId, true).catch(oops));
      frag.appendChild(stage);
    }
  }

  // marks first: what you find scrawled at the site before you know its story
  for (const mark of marks) {
    frag.appendChild(el('p', 'mark', `someone scrawled here: “${mark.markText}”`));
  }

  for (const event of events) {
    // the event still unfolding at the table's present reads warm; jacks in
    // the header mirror the map's grammar — solid voices in, hollow waiting
    const fresh = event.session === data.campaign.currentSession && session === data.campaign.currentSession;
    const sec = el('section', 'event' + (fresh ? ' fresh' : ''));
    const head = el('h3', undefined, `Session ${event.session}`);
    if (fresh) head.appendChild(el('span', 'now-tag', 'now'));
    const jacks = el('span', 'slot-jacks');
    for (const memberId of event.participantIds) {
      const told = data.testimony.some((t) => t.eventId === event.id && t.memberId === memberId);
      jacks.appendChild(el('i', 'jack' + (told ? ' told' : '')));
    }
    head.appendChild(jacks);
    sec.appendChild(head);
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
        applyDraft(area, `testimony:${event.id}`, entry.text);
        const save = el('button', undefined, 'amend');
        save.addEventListener('click', () => {
          if (area.value.trim()) store.writeTestimony(event.id, area.value.trim()).catch(oops);
        });
        const hint = el('p', 'grace-hint', 'open until the next session begins');
        t.append(area, save, hint);
        if (!entry.markText) {
          const markForm = lineForm(`leave a mark on this place (${MARK_MAX_CHARS} chars)`, 'scrawl', (v) => store.promoteMark(entry.id, v), MARK_MAX_CHARS);
          applyDraft(markForm.querySelector('input')!, `mark:${entry.id}`);
          t.appendChild(markForm);
        }
      } else if (entry) {
        t.appendChild(el('p', undefined, entry.text));
      } else if (mine && writable) {
        const area = el('textarea');
        area.placeholder = 'what happened here, as you remember it';
        applyDraft(area, `testimony:${event.id}`);
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
    const eventForm = lineForm('one line of canon: what happened here', 'drop it', (v) => store.addEvent(pinId, v));
    applyDraft(eventForm.querySelector('input')!, `event:${pinId}`);
    add.appendChild(eventForm);
    frag.appendChild(add);
  }

  host.replaceChildren(frag);
  restoreFocus(host, drafts);
}
