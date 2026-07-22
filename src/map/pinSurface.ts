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
import { MARK_MAX_CHARS, MAX_ATMOSPHERE_CHARS } from '../model';
import { eventParticipants } from '../mutations';
import { siteMarks } from './render';

/**
 * Editors the viewer has deliberately opened (amend / scrawl), keyed so they
 * survive the wholesale re-renders. Closed editors are the default: a written
 * entry reads as text, not as a form asking to be rewritten.
 */
const openEditors = new Set<string>();

/**
 * Who the owner has *unchecked* on each pin's new-event picker, keyed by pin —
 * held here so the choice survives the poll's wholesale re-renders (checkboxes
 * carry state in `.checked`, which the draft harvest doesn't cover). Absent =
 * the default, the whole table; cleared once an event drops.
 */
const excludedParticipants = new Map<string, Set<string>>();

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

/**
 * Canon authorship: the one-line headline plus optional atmosphere prose.
 * Submit clears both optimistically; a refused submit puts the words back.
 */
function canonForm(
  canonPlaceholder: string,
  button: string,
  onSubmit: (canon: string, atmosphere: string | undefined) => Promise<unknown>,
  confirmSubmit?: (canon: string, atmosphere: string | undefined) => boolean,
): HTMLFormElement {
  const form = el('form', 'canon-form');
  const input = el('input');
  input.placeholder = canonPlaceholder;
  const air = el('textarea');
  air.placeholder = 'the air of the place — optional';
  air.maxLength = MAX_ATMOSPHERE_CHARS;
  const btn = el('button', undefined, button);
  form.append(input, air, btn);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const canon = input.value.trim();
    if (!canon) return;
    const atmosphere = air.value.trim() || undefined;
    // an irreversible act (reveal) confirms *before* the optimistic clear, so
    // backing out leaves the words untouched and raises no error
    if (confirmSubmit && !confirmSubmit(canon, atmosphere)) return;
    input.value = '';
    air.value = '';
    onSubmit(canon, atmosphere).catch((e: unknown) => {
      input.value = canon;
      air.value = atmosphere ?? '';
      oops(e);
    });
  });
  return form;
}

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
  const rerender = (): void => renderPinSurface(host, ctx);
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
      // a titled, confirmed block: reveal is the one act on this surface with
      // no way back, and it must not read as a twin of the secret-prep form
      frag.appendChild(el('h3', 'reveal-head', 'Reveal to the table'));
      const revealForm = canonForm(
        'what the table now learns',
        'reveal',
        (v, air) => store.revealPin(pinId, v, air),
        () => confirm(`Reveal “${pin.name}” to the table? Everything staged here becomes theirs to read — there is no way back to secret.`),
      );
      revealForm.classList.add('reveal-form');
      applyDraft(revealForm.querySelector('input')!, `reveal:${pinId}`);
      applyDraft(revealForm.querySelector('textarea')!, `reveal-air:${pinId}`);
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

  for (const event of events) {
    // the event still unfolding at the table's present reads warm; jacks in
    // the header mirror the map's grammar — solid voices in, hollow waiting
    const fresh = event.session === data.campaign.currentSession && session === data.campaign.currentSession;
    const sec = el('section', 'event' + (fresh ? ' fresh' : ''));
    const head = el('h3', undefined, `Session ${event.session}`);
    if (fresh) head.appendChild(el('span', 'now-tag', 'now'));
    // slots resolve live: an open-table event grows a slot for each current
    // member, so a latecomer isn't locked out of history they were present for
    const participants = eventParticipants(data, event);
    const jacks = el('span', 'slot-jacks');
    for (const memberId of participants) {
      const told = data.testimony.some((t) => t.eventId === event.id && t.memberId === memberId);
      jacks.appendChild(el('i', 'jack' + (told ? ' told' : '')));
    }
    head.appendChild(jacks);
    sec.appendChild(head);
    // canon leads: the owner's record is the anchor every testimony hangs from
    sec.appendChild(el('p', 'event-canon', event.canonLine));
    if (event.atmosphere) sec.appendChild(el('p', 'event-atmosphere', event.atmosphere));

    for (const memberId of participants) {
      const member = data.members.find((m) => m.id === memberId);
      const entry = data.testimony.find((t) => t.eventId === event.id && t.memberId === memberId);
      const mine = memberId === viewerId;

      const t = el('div', 'testimony' + (entry ? '' : ' empty'));
      t.appendChild(el('span', 'testimony-author', member?.name ?? '?'));

      if (entry && mine && writable && store.canEdit(entry)) {
        // still in the grace window — but a written entry reads as text by
        // default; the author opens the editor deliberately
        const editKey = `edit:${event.id}`;
        const markKey = `mark-open:${entry.id}`;
        if (openEditors.has(editKey)) {
          const area = el('textarea');
          applyDraft(area, `testimony:${event.id}`, entry.text);
          const save = el('button', undefined, 'amend');
          save.addEventListener('click', () => {
            if (!area.value.trim()) return;
            store
              .writeTestimony(event.id, area.value.trim())
              .then(() => {
                openEditors.delete(editKey);
                rerender();
              })
              .catch(oops);
          });
          const hint = el('p', 'grace-hint', 'open until the next session begins');
          t.append(area, save, hint);
        } else {
          t.appendChild(el('p', undefined, entry.text));
          const row = el('div', 'entry-acts');
          const amend = el('button', 'act', 'amend');
          amend.addEventListener('click', () => {
            openEditors.add(editKey);
            rerender();
          });
          row.appendChild(amend);
          if (!entry.markText && !openEditors.has(markKey)) {
            const scrawl = el('button', 'act', 'scrawl a mark');
            scrawl.addEventListener('click', () => {
              openEditors.add(markKey);
              rerender();
            });
            row.appendChild(scrawl);
          }
          t.appendChild(row);
        }
        if (!entry.markText && openEditors.has(markKey)) {
          const markForm = lineForm(`leave a mark on this place (${MARK_MAX_CHARS} chars)`, 'scrawl', (v) =>
            store.promoteMark(entry.id, v).then(() => {
              openEditors.delete(markKey);
              rerender();
            }),
          MARK_MAX_CHARS);
          applyDraft(markForm.querySelector('input')!, `mark:${entry.id}`);
          t.appendChild(markForm);
        }
      } else if (entry) {
        t.appendChild(el('p', undefined, entry.text));
        // your own account, at the present, with its grace window shut: say so,
        // or the vanished amend/scrawl reads as a bug rather than the rule it is
        if (mine && writable && !store.canEdit(entry)) {
          t.appendChild(el('p', 'grace-hint sealed-hint', 'sealed — the table has moved on'));
        }
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

  // graffiti follows the record: what's scrawled at the site, after its story
  if (marks.length > 0) {
    const found = el('section', 'marks-found');
    for (const mark of marks) {
      found.appendChild(el('p', 'mark', `someone scrawled here: “${mark.markText}”`));
    }
    frag.appendChild(found);
  }

  if (isOwner && writable) {
    const add = el('section', 'add-event');
    // on a staged pin this form preps a secret event (it arrives with the
    // reveal, not now) — say so, so it never reads as "publish this"
    const heading = pin.hidden
      ? `Prep a secret event · Session ${data.campaign.currentSession}`
      : `New event · Session ${data.campaign.currentSession}`;
    add.appendChild(el('h3', undefined, heading));

    // who was present. Default = the whole table (all checked), which stays
    // live so a latecomer still gets a slot; unchecking anyone scopes the
    // event to an explicit subset, so an absent player carries no permanent
    // open slot here. The choice is held in excludedParticipants across the
    // poll's re-renders. Shown only when there's actually a choice to make.
    const roster = data.members;
    const boxes = new Map<string, HTMLInputElement>();
    if (roster.length > 1) {
      const excluded = excludedParticipants.get(pinId) ?? new Set<string>();
      const picker = el('div', 'participant-picker');
      picker.appendChild(el('span', 'picker-label', 'who was here'));
      for (const m of roster) {
        const label = el('label', 'participant');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = !excluded.has(m.id);
        box.addEventListener('change', () => {
          const set = excludedParticipants.get(pinId) ?? new Set<string>();
          if (box.checked) set.delete(m.id);
          else set.add(m.id);
          excludedParticipants.set(pinId, set);
        });
        boxes.set(m.id, box);
        label.append(box, document.createTextNode(m.name + (m.status === 'pending' ? ' (pending)' : '')));
        picker.appendChild(label);
      }
      add.appendChild(picker);
    }

    const eventForm = canonForm('one line of canon: what happened here', 'drop it', (v, air) => {
      const chosen = roster.filter((m) => boxes.get(m.id)?.checked ?? true).map((m) => m.id);
      // all present (or none picked) → the whole table, resolved live; a strict
      // subset → an explicit, owner-scoped participant list
      const participantIds = chosen.length === 0 || chosen.length === roster.length ? undefined : chosen;
      return store.addEvent(pinId, v, air, participantIds).then((ev) => {
        excludedParticipants.delete(pinId); // the next event starts from the whole table again
        return ev;
      });
    });
    applyDraft(eventForm.querySelector('input')!, `event:${pinId}`);
    applyDraft(eventForm.querySelector('textarea')!, `event-air:${pinId}`);
    add.appendChild(eventForm);
    frag.appendChild(add);
  }

  host.replaceChildren(frag);
  restoreFocus(host, drafts);
}
