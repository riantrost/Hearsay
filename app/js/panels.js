// panels.js — the sheets you open on top of the map: seat picker, add/edit event,
// pin detail (the open jacks + testimony), warband page, and campaign settings.
// These read and mutate through state.js and re-render the map via a passed callback.

import * as S from './state.js';
import * as Y from './sync.js';
import * as R from './reads.js';
import { el, openSheet, closeSheet, toast, confirmDialog } from './ui.js';
import { pickImage } from './util.js';

const TYPE_LABEL = { battle: 'Battle', discovery: 'Discovery', loss: 'Loss', arrival: 'Arrival', other: 'Event' };

function fmtSession(n) { return 'Session ' + n; }

// ---- seat picker (identity-first) -----------------------------------------

export function openSeatPicker(state, onPicked) {
  const body = el('div', {}, [
    el('p', { class: 'muted', style: { marginTop: 0 },
      text: 'Whose seat is this device? Testimony you write is signed by this seat — it stays on this device.' }),
    el('button', { class: 'seat seat--owner', onclick: () => pick('owner') }, [
      el('span', { class: 'seat__dot', style: { background: 'var(--canon)' } }),
      el('span', {}, [el('strong', { text: 'Campaign owner' }), el('span', { class: 'muted', text: ' · GM / canon' })]),
    ]),
    ...state.players.map(p => el('button', { class: 'seat', onclick: () => pick(p.id) }, [
      el('span', { class: 'seat__dot', style: { background: p.color } }),
      el('span', {}, [el('strong', { text: p.name })]),
    ])),
  ]);
  function pick(id) {
    S.setIdentity(state.id, id);
    // On a connected campaign the seat is also recorded on the server — that's
    // what lets row security accept this device's words for that seat.
    if (Y.isConnected(state) && id !== 'owner') {
      Y.claimSeat(state, id).catch(() =>
        toast('Seat saved on this device, but the table server refused it — writes will retry on sync.'));
    }
    closeSheet(); onPicked && onPicked();
  }
  openSheet('Take a seat', body);
}

// ---- table server: publish + invite -----------------------------------------

export function openPublish(state, onDone) {
  const def = JSON.parse(localStorage.getItem('hearsay.server') || 'null') || {};
  const urlI = el('input', { class: 'input', placeholder: 'https://your-project.supabase.co', value: def.url || '' });
  const keyI = el('input', { class: 'input', placeholder: 'anon public key (eyJ…)', value: def.anonKey || '' });
  const go = el('button', { class: 'btn btn--primary', text: 'Publish', onclick: async () => {
    if (!urlI.value.trim() || !keyI.value.trim()) return;
    go.disabled = true; go.textContent = 'Publishing…';
    try {
      await Y.publishCampaign(state, { url: urlI.value.trim(), anonKey: keyI.value.trim() });
      closeSheet();
      openInvite(state);
      onDone && onDone();
    } catch (err) {
      toast(err.message);
      go.disabled = false; go.textContent = 'Publish';
    }
  } });
  openSheet('Publish to a table server', el('div', {}, [
    el('p', { class: 'muted', style: { marginTop: 0 },
      text: 'A table server lets everyone hold the same campaign on their own phone. One-time setup: create a free Supabase project, run supabase/schema.sql on it, and enable anonymous sign-ins.' }),
    field('Server URL', urlI),
    field('Anon key', keyI),
    el('p', { class: 'muted mini', text: 'The anon key is public by design — who may read and write what is enforced row by row, by seat.' }),
    el('div', { class: 'row row--end' }, [go]),
  ]));
}

export function openInvite(state) {
  const invite = Y.makeInvite(state.remote);
  const ta = el('textarea', { class: 'input input--area', rows: '3', readonly: 'readonly' });
  ta.value = invite;
  openSheet('Table & invite', el('div', {}, [
    el('p', { class: 'muted', style: { marginTop: 0 },
      text: 'Hand this line to your table — pasting it under “Join a table” seats their device at this campaign.' }),
    ta,
    el('p', { class: 'muted mini', text: 'An invite seats a device; it grants no power over canon. The owner seat can’t be claimed with it.' }),
    el('div', { class: 'row row--end' }, [
      el('button', { class: 'btn btn--primary', text: 'Copy invite', onclick: () => {
        (navigator.clipboard?.writeText(invite) || Promise.reject())
          .then(() => toast('Invite copied — send it to your table.'))
          .catch(() => { ta.select(); document.execCommand('copy'); toast('Invite copied.'); });
      } }),
    ]),
  ]));
}

// ---- add / edit event ------------------------------------------------------

export function openEventEditor(state, { x, y, event }, onDone) {
  const editing = !!event;
  const nameI = el('input', { class: 'input', placeholder: 'What happened here?', value: event?.name || '' });
  const sessionI = el('input', { class: 'input', type: 'number', min: '1',
    value: String(event?.session ?? state.currentSession) });
  const canonI = el('textarea', { class: 'input input--area', rows: '2',
    placeholder: 'One line of canon — cheap enough to write from the couch.' , }, event?.canon || '');
  canonI.value = event?.canon || '';

  let type = event?.type || 'battle';
  const typeRow = el('div', { class: 'chips' }, S.eventTypes.map(t =>
    el('button', { class: 'chip' + (t === type ? ' chip--on' : ''), 'data-t': t, text: TYPE_LABEL[t],
      onclick: (e) => { type = t; [...typeRow.children].forEach(c => c.classList.toggle('chip--on', c.dataset.t === t)); } })));

  // which players get an open jack
  const slotSet = new Set(event ? event.slots : state.players.map(p => p.id));
  const slotRow = el('div', { class: 'chips' }, state.players.map(p =>
    el('button', { class: 'chip' + (slotSet.has(p.id) ? ' chip--on' : ''), text: p.name,
      onclick: (e) => { slotSet.has(p.id) ? slotSet.delete(p.id) : slotSet.add(p.id);
        e.currentTarget.classList.toggle('chip--on'); } })));

  let hidden = event ? event.hidden : false;
  const hiddenBtn = el('button', { class: 'toggle' + (hidden ? ' toggle--on' : ''),
    onclick: (e) => { hidden = !hidden; e.currentTarget.classList.toggle('toggle--on', hidden);
      e.currentTarget.querySelector('.toggle__label').textContent = hidden ? 'Staged — hidden from players' : 'Visible to players'; } },
    [el('span', { class: 'toggle__knob' }), el('span', { class: 'toggle__label', text: hidden ? 'Staged — hidden from players' : 'Visible to players' })]);

  const body = el('div', {}, [
    field('Event', nameI),
    el('div', { class: 'row' }, [
      el('div', { style: { flex: '1' } }, [field('Session', sessionI)]),
      el('div', { style: { flex: '2' } }, [field('Type', typeRow)]),
    ]),
    field('Canon', canonI),
    field('Open a journal slot for', slotRow),
    field('Fog', hiddenBtn),
    el('div', { class: 'row row--end' }, [
      editing && el('button', { class: 'btn btn--danger', text: 'Delete', onclick: async () => {
        if (await confirmDialog('Delete this event and its testimony? This cannot be undone.', { danger: true, okLabel: 'Delete' })) {
          S.deleteEvent(event.id); closeSheet(); onDone && onDone();
        }
      } }),
      el('button', { class: 'btn btn--primary', text: editing ? 'Save' : 'Drop pin', onclick: () => {
        const payload = { name: nameI.value, canon: canonI.value, type,
          session: parseInt(sessionI.value, 10) || state.currentSession,
          slots: [...slotSet], hidden };
        if (editing) S.updateEvent(event.id, payload);
        else S.addEvent({ x, y, ...payload });
        closeSheet(); onDone && onDone();
      } }),
    ]),
  ]);
  openSheet(editing ? 'Edit event' : 'New event', body);
}

// ---- pin detail: canon + the open jacks -----------------------------------

export function openPinDetail(state, event, onDone) {
  const identity = S.getIdentity(state.id);
  const isOwner = identity === 'owner';
  const locked = state.concluded;

  // Which words are new to this device — decided before opening witnesses them,
  // so the sheet can point at exactly the entries worth rereading, once.
  const newWords = R.unreadAuthorsOn(state, event);

  const head = el('div', { class: 'pin-head' }, [
    el('div', { class: 'pin-head__meta' }, [
      el('span', { class: 'tag tag--' + event.type, text: TYPE_LABEL[event.type] }),
      el('span', { class: 'muted', text: fmtSession(event.session) }),
      event.hidden && isOwner ? el('span', { class: 'tag tag--staged', text: 'Staged' }) : null,
    ]),
    event.canon ? el('p', { class: 'canon', text: event.canon }) : el('p', { class: 'muted', text: 'No canon line yet.' }),
  ]);

  const slots = event.slots.map(pid => {
    const p = S.playerById(pid);
    if (!p) return null;
    const t = S.getTestimony(event.id, pid);
    const mine = identity === pid;
    const canRead = S.testimonyReadable(pid, identity, state);
    const filled = !!t;

    const slot = el('div', { class: 'slot' + (filled ? ' slot--filled' : ' slot--open') + (newWords.has(pid) ? ' slot--new' : '') }, [
      el('div', { class: 'slot__by' }, [
        el('span', { class: 'slot__dot', style: { background: p.color } }),
        el('strong', { text: p.name }),
        mine ? el('span', { class: 'muted', text: ' · you' }) : null,
        newWords.has(pid) ? el('span', { class: 'slot__newmark', text: 'new words' }) : null,
      ]),
    ]);

    if (filled && canRead) {
      slot.appendChild(el('p', { class: 'slot__text', text: t.text }));
    } else if (filled && !canRead) {
      slot.appendChild(el('p', { class: 'slot__sealed muted', text: 'Sealed until the campaign concludes.' }));
    } else {
      slot.appendChild(el('p', { class: 'slot__empty muted', text: mine ? 'Your journal for this event is open.' : 'Open journal — awaiting ' + p.name + '.' }));
    }

    // Only the seat's owner can write their own words; owner never edits testimony.
    if (mine && !locked) {
      slot.appendChild(el('button', { class: 'btn btn--ghost btn--sm', text: filled ? 'Edit your entry' : 'Write your entry',
        onclick: () => openTestimonyEditor(state, event, pid, onDone) }));
    }
    return slot;
  }).filter(Boolean);

  const ownerControls = isOwner && !locked ? el('div', { class: 'row row--end owner-controls' }, [
    event.hidden ? el('button', { class: 'btn btn--primary', text: 'Reveal to players',
      onclick: () => { S.revealEvent(event.id); toast('Revealed — this reveal is now in the timeline.'); closeSheet(); onDone && onDone(); } }) : null,
    el('button', { class: 'btn', text: 'Edit event', onclick: () => openEventEditor(state, { event }, onDone) }),
  ]) : null;

  openSheet(event.name, el('div', {}, [head, el('div', { class: 'slots' }, slots), ownerControls]));

  // Opening the pin is the act of witnessing: the ember behind the sheet goes out.
  if (newWords.size) {
    R.witnessEvent(state, event);
    onDone && onDone();
  }
}

function openTestimonyEditor(state, event, playerId, onDone) {
  const existing = S.getTestimony(event.id, playerId);
  const area = el('textarea', { class: 'input input--area input--tall', rows: '6',
    placeholder: 'In your character’s voice. A single sentence is a complete entry.' });
  area.value = existing?.text || '';
  const body = el('div', {}, [
    el('p', { class: 'muted', style: { marginTop: 0 }, text: event.name + ' · ' + fmtSession(event.session) }),
    area,
    el('div', { class: 'row row--end' }, [
      el('button', { class: 'btn', text: 'Cancel', onclick: () => openPinDetail(state, event, onDone) }),
      el('button', { class: 'btn btn--primary', text: 'Save entry', onclick: () => {
        S.writeTestimony(event.id, playerId, area.value);
        openPinDetail(state, event, onDone);
      } }),
    ]),
  ]);
  openSheet('Your testimony', body);
  setTimeout(() => area.focus(), 50);
}

// ---- warband page ----------------------------------------------------------

export function openWarband(state, playerId, viewSession, onDone) {
  const p = S.playerById(playerId);
  const identity = S.getIdentity(state.id);
  const mine = identity === playerId;
  const viewingPast = viewSession != null && viewSession < state.currentSession;
  const text = viewingPast ? S.warbandAt(playerId, viewSession) : S.getWarband(playerId).current;

  const area = el('textarea', { class: 'input input--area input--tall', rows: '8',
    placeholder: 'Who are you fielding? The roster, the wizard, who died last game — in your own voice.' });
  area.value = text || '';
  area.disabled = !mine || state.concluded || viewingPast;

  const snaps = S.getWarband(playerId).snapshots;
  const history = snaps.length ? el('details', { class: 'history' }, [
    el('summary', { text: `${snaps.length} earlier snapshot${snaps.length > 1 ? 's' : ''}` }),
    ...snaps.slice().reverse().map(s => el('div', { class: 'snap' }, [
      el('div', { class: 'muted', text: fmtSession(s.session) }),
      el('p', { text: s.text }),
    ])),
  ]) : null;

  const body = el('div', {}, [
    el('div', { class: 'pin-head__meta' }, [
      el('span', { class: 'slot__dot', style: { background: p.color } }),
      el('strong', { text: p.name + '’s warband' }),
      viewingPast ? el('span', { class: 'tag tag--staged', text: 'as of ' + fmtSession(viewSession) }) : null,
    ]),
    el('p', { class: 'muted', style: { marginTop: '4px' },
      text: 'A living document — edits are snapshotted by session so the scrubber remembers who you were.' }),
    area,
    mine && !state.concluded && !viewingPast ? el('div', { class: 'row row--end' }, [
      el('button', { class: 'btn btn--primary', text: 'Save', onclick: () => {
        S.writeWarband(playerId, area.value); toast('Warband saved · ' + fmtSession(state.currentSession));
        closeSheet(); onDone && onDone();
      } }),
    ]) : null,
    history,
  ]);
  openSheet('Warband', body);
}

// ---- campaign settings -----------------------------------------------------

export function openSettings(state, onDone) {
  const gridSel = el('select', { class: 'input' }, [
    opt('freeform', 'Freeform (none)'), opt('square', 'Square'), opt('hex', 'Hex'),
  ]);
  gridSel.value = state.grid.mode;
  const sizeI = el('input', { class: 'input', type: 'number', min: '2', max: '40', value: String(state.grid.size) });

  const sealSel = el('select', { class: 'input' }, [
    opt('open', 'Open — players read each other freely'),
    opt('until-conclusion', 'Sealed until the campaign concludes'),
  ]);
  sealSel.value = state.sealing;

  const addName = el('input', { class: 'input', placeholder: 'Add a player…' });
  const playerList = el('div', { class: 'chips' }, state.players.map(p =>
    el('span', { class: 'chip chip--on', style: { borderColor: p.color } }, [
      el('span', { class: 'slot__dot', style: { background: p.color } }), p.name,
    ])));

  const body = el('div', {}, [
    field('Grid overlay', el('div', { class: 'row' }, [
      el('div', { style: { flex: 2 } }, [gridSel]),
      el('div', { style: { flex: 1 } }, [sizeI]),
    ])),
    el('p', { class: 'muted mini', text: 'Reference only — names places, snaps pins for tidiness. It measures nothing.' }),
    field('World map', el('button', { class: 'btn', text: state.map ? 'Replace world map' : 'Upload world map',
      onclick: async () => { const p = await pickImage(); if (!p) return; await S.setMapImage(p.blob, p.w, p.h); toast('Map updated.'); closeSheet(); onDone && onDone(); } })),
    field('Testimony visibility', sealSel),
    field('Players', el('div', {}, [
      playerList,
      el('div', { class: 'row' }, [
        addName,
        el('button', { class: 'btn', text: 'Add', onclick: () => {
          if (addName.value.trim()) { S.addPlayer(addName.value); openSettings(state, onDone); }
        } }),
      ]),
    ])),
    el('hr', { class: 'rule' }),
    field('Campaign', state.concluded
      ? el('button', { class: 'btn', text: 'Reopen campaign', onclick: () => { S.reopenCampaign(); closeSheet(); onDone && onDone(); } })
      : el('button', { class: 'btn btn--danger', text: 'Conclude campaign', onclick: async () => {
          if (await confirmDialog('Conclude the campaign? It becomes a read-only archive — still scrubbable forever. Slots stay fillable.', { okLabel: 'Conclude' })) {
            S.concludeCampaign(); closeSheet(); onDone && onDone();
          }
        } })),
    el('div', { class: 'row row--end' }, [
      el('button', { class: 'btn btn--primary', text: 'Done', onclick: () => {
        state.grid.mode = gridSel.value;
        state.grid.size = parseInt(sizeI.value, 10) || 6;
        state.sealing = sealSel.value;
        S.commit();
        closeSheet(); onDone && onDone();
      } }),
    ]),
  ]);
  openSheet('Campaign settings', body);
}

// ---- small helpers ---------------------------------------------------------

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'field__label', text: label }), control]);
}
function opt(v, t) { return el('option', { value: v, text: t }); }
