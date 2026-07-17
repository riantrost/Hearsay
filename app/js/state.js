// state.js — the in-memory campaign model and every mutation that touches it.
// One source of truth (`current`), a subscribe/notify loop for the UI, debounced
// autosave to IndexedDB, and portable JSON export/import (image inlined as a data URL).
//
// Identity is deliberately NOT part of the campaign: "who am I at this table" is a
// per-device choice (identity-first, table-private), kept in localStorage so a shared
// export doesn't carry one player's seat to everyone else's phone.

import { db } from './db.js';

const SCHEMA = 1;
const EVENT_TYPES = ['battle', 'discovery', 'loss', 'arrival', 'other'];
const PLAYER_COLORS = ['#e0524b', '#3f8cd6', '#4aa96c', '#c9922e', '#9163cb', '#26a3a3', '#c85b9a', '#7b8794'];

let current = null;           // the open campaign state, or null
const listeners = new Set();
let saveTimer = null;

// ---- id + subscription plumbing -------------------------------------------

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(current);
}

function touch() {
  if (!current) return;
  current.updatedAt = Date.now();
  notify();
  if (saveTimer) clearTimeout(saveTimer);
  // Capture the campaign now: `current` may be nulled (closeCampaign) or swapped
  // (loadCampaign) before the debounce fires, and the pending edit must still land.
  const snapshot = current;
  saveTimer = setTimeout(() => { saveTimer = null; db.putCampaign(snapshot); }, 250);
}

// Persist any debounced edit immediately. Called before the open campaign changes,
// so navigating away within the debounce window can never drop a player's words.
function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (current) db.putCampaign(current);
}

// ---- identity (per device) -------------------------------------------------

export function getIdentity(campaignId) {
  return localStorage.getItem('hearsay.identity.' + campaignId) || null;
}
export function setIdentity(campaignId, playerIdOrOwner) {
  localStorage.setItem('hearsay.identity.' + campaignId, playerIdOrOwner);
  notify();
}
export function isOwner(campaignId) {
  return getIdentity(campaignId) === 'owner';
}

// ---- lifecycle -------------------------------------------------------------

export function getState() { return current; }
export const eventTypes = EVENT_TYPES;

// Persist + notify after a caller mutates `current` in place (e.g. settings edits).
export function commit() { touch(); }

export async function listCampaigns() {
  const all = await db.listCampaigns();
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function loadCampaign(id) {
  flushSave();
  current = await db.getCampaign(id);
  notify();
  return current;
}

export function closeCampaign() {
  flushSave();
  current = null;
  notify();
}

export async function createCampaign({ name, playerNames }) {
  const players = (playerNames || []).filter(Boolean).map((n, i) => ({
    id: uid('p'), name: n.trim(), color: PLAYER_COLORS[i % PLAYER_COLORS.length],
  }));
  const state = {
    schema: SCHEMA,
    id: uid('c'),
    name: name.trim() || 'Untitled Campaign',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentSession: 1,
    concluded: false,
    sealing: 'open',                 // 'open' | 'until-conclusion'
    grid: { mode: 'freeform', size: 6, offsetX: 0, offsetY: 0 },
    map: null,                        // { imageId, w, h }
    players,
    events: [],
    testimony: {},                    // eventId -> playerId -> { text, updatedAt }
    warbands: {},                     // playerId -> { current, snapshots: [{session,text,at}] }
  };
  current = state;
  await db.putCampaign(state);
  // Default the creator's seat to owner.
  setIdentity(state.id, 'owner');
  notify();
  return state;
}

// ---- map -------------------------------------------------------------------

export async function setMapImage(blob, naturalW, naturalH) {
  if (!current) return;
  const imageId = uid('img');
  await db.putImage(imageId, blob);
  current.map = { imageId, w: naturalW, h: naturalH };
  touch();
}

export function getMapBlob() {
  if (!current || !current.map) return Promise.resolve(null);
  return db.getImage(current.map.imageId);
}

// Blob for any campaign (used by the shelf thumbnails, which aren't `current`).
export function getImageForCard(campaign) {
  if (!campaign.map) return Promise.resolve(null);
  return db.getImage(campaign.map.imageId);
}

// ---- players ---------------------------------------------------------------

export function addPlayer(name) {
  if (!current) return;
  const i = current.players.length;
  const p = { id: uid('p'), name: name.trim(), color: PLAYER_COLORS[i % PLAYER_COLORS.length] };
  current.players.push(p);
  touch();
  return p;
}

export function playerById(id) {
  return current?.players.find(p => p.id === id) || null;
}

// ---- sessions (the clock) --------------------------------------------------

export function setCurrentSession(n) {
  if (!current) return;
  current.currentSession = Math.max(1, Math.round(n));
  touch();
}
export function advanceSession() {
  if (!current) return;
  current.currentSession += 1;
  touch();
}
export function maxSession() {
  if (!current) return 1;
  let m = current.currentSession;
  for (const e of current.events) {
    m = Math.max(m, e.session, e.revealSession || 0);
  }
  return m;
}

// ---- events (pins) ---------------------------------------------------------

export function addEvent({ name, x, y, session, type, canon, slots, hidden }) {
  if (!current) return;
  const e = {
    id: uid('e'),
    name: name.trim() || 'Untitled event',
    x, y,
    session: session ?? current.currentSession,
    type: EVENT_TYPES.includes(type) ? type : 'other',
    canon: (canon || '').trim(),
    slots: slots && slots.length ? slots : current.players.map(p => p.id),
    hidden: !!hidden,
    // A hidden pin has no reveal yet; a visible pin was "revealed" the session it landed.
    revealSession: hidden ? null : (session ?? current.currentSession),
  };
  current.events.push(e);
  touch();
  return e;
}

export function updateEvent(id, patch) {
  if (!current) return;
  const e = current.events.find(ev => ev.id === id);
  if (!e) return;
  const wasHidden = e.hidden;
  Object.assign(e, patch);
  // Un-hiding through Edit is still a reveal: stamp it so the scrubber shows the
  // pin appearing now, not retroactively since its origin session. Re-staging
  // clears the stamp so a later reveal gets a fresh one.
  if (wasHidden && !e.hidden) e.revealSession = current.currentSession;
  else if (!wasHidden && e.hidden) e.revealSession = null;
  touch();
}

export function revealEvent(id) {
  if (!current) return;
  const e = current.events.find(ev => ev.id === id);
  if (!e) return;
  e.hidden = false;
  e.revealSession = current.currentSession; // the reveal is itself a timeline event
  touch();
}

export function deleteEvent(id) {
  if (!current) return;
  current.events = current.events.filter(e => e.id !== id);
  delete current.testimony[id];
  touch();
}

// Is an event on the map as of a given session, for a given viewer?
export function eventVisibleAt(e, session, viewerIsOwner) {
  if (e.session > session) return false;             // hasn't happened yet on the clock
  if (viewerIsOwner) return true;                    // owner sees staged pins too
  if (e.hidden) return false;                        // staged, never revealed
  if (e.revealSession != null && e.revealSession > session) return false; // revealed later
  return true;
}

// ---- testimony -------------------------------------------------------------

export function getTestimony(eventId, playerId) {
  return current?.testimony?.[eventId]?.[playerId] || null;
}

export function writeTestimony(eventId, playerId, text) {
  if (!current) return;
  if (!current.testimony[eventId]) current.testimony[eventId] = {};
  const t = (text || '').trim();
  if (!t) {
    delete current.testimony[eventId][playerId];
  } else {
    current.testimony[eventId][playerId] = { text: t, updatedAt: Date.now() };
  }
  touch();
}

// Can `viewer` read `authorId`'s testimony on this event?
export function testimonyReadable(authorId, viewerIdentity, campaign) {
  if (viewerIdentity === 'owner') return true;          // owner reads everything
  if (viewerIdentity === authorId) return true;         // your own words, always
  if (campaign.sealing === 'until-conclusion' && !campaign.concluded) return false;
  return true;                                          // open by default
}

// ---- warband (living document, snapshotted by session) ---------------------

export function getWarband(playerId) {
  return current?.warbands?.[playerId] || { current: '', snapshots: [] };
}

export function writeWarband(playerId, text) {
  if (!current) return;
  const wb = current.warbands[playerId] || { current: '', snapshots: [] };
  const prev = wb.current || '';
  const next = text || '';
  if (prev === next) return;
  // Snapshot the state we're leaving, stamped with the session it stood in.
  // Collapse consecutive snapshots from the same session so one editing spree
  // doesn't bury the scrubber in near-identical frames.
  const stampSession = current.currentSession;
  const last = wb.snapshots[wb.snapshots.length - 1];
  if (prev && (!last || last.session !== stampSession)) {
    wb.snapshots.push({ session: stampSession, text: prev, at: Date.now() });
  } else if (prev && last && last.session === stampSession) {
    // keep the earliest text for this session (what it grew from)
  }
  wb.current = next;
  current.warbands[playerId] = wb;
  touch();
}

// The warband as it stood at `session` (for the scrubber).
export function warbandAt(playerId, session) {
  const wb = getWarband(playerId);
  if (session >= current.currentSession) return wb.current;
  // Find the earliest snapshot taken in a session AFTER the one we're viewing:
  // its `text` is what stood BEFORE that edit — i.e. the state during `session`.
  const later = wb.snapshots.filter(s => s.session > session).sort((a, b) => a.session - b.session)[0];
  if (later) return later.text;
  return wb.current;
}

// ---- conclusion / archive --------------------------------------------------

export function concludeCampaign() {
  if (!current) return;
  current.concluded = true;
  touch();
}
export function reopenCampaign() {
  if (!current) return;
  current.concluded = false;
  touch();
}

// ---- export / import (portable, image inlined) -----------------------------

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}

export async function exportCampaign() {
  if (!current) return null;
  const bundle = JSON.parse(JSON.stringify(current));
  if (current.map) {
    const blob = await getMapBlob();
    bundle._image = blob ? await blobToDataURL(blob) : null;
  }
  bundle._hearsay = 'campaign-export';
  return bundle;
}

export async function importCampaign(bundle) {
  if (!bundle || bundle._hearsay !== 'campaign-export') {
    throw new Error('Not a Hearsay campaign export.');
  }
  const state = JSON.parse(JSON.stringify(bundle));
  const image = state._image;
  delete state._image;
  delete state._hearsay;
  // Fresh id so importing never clobbers an existing campaign on this device.
  state.id = uid('c');
  state.updatedAt = Date.now();
  if (image && state.map) {
    const blob = await dataURLToBlob(image);
    const imageId = uid('img');
    await db.putImage(imageId, blob);
    state.map.imageId = imageId;
  }
  await db.putCampaign(state);
  current = state;
  notify();
  return state;
}
