// sync.js — the cloud layer. Everything Supabase lives here; the rest of the app stays
// unaware of it. When config.js is blank this module is inert and Hearsay is exactly the
// local-first app it was. When configured, it: signs each device in anonymously (a stable
// identity, no email), publishes a local campaign to the cloud, joins one by code, claims
// a seat, subscribes to live changes, and pushes individual mutations through.
//
// Dependency direction is one-way: state.js → sync.js → (supabase, db). sync never imports
// state; realtime changes flow back via a caller-supplied callback that re-reads the cloud.

import { createClient } from '../vendor/supabase-js.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, cloudConfigured } from '../config.js';
import { db } from './db.js';

let client = null;
let userId = null;

export { cloudConfigured };

// ---- lifecycle -------------------------------------------------------------

// Create the client and ensure an anonymous session. Safe to call repeatedly.
export async function init() {
  if (!cloudConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hearsay.auth' },
    });
  }
  const { data: { session } } = await client.auth.getSession();
  if (session) {
    userId = session.user.id;
  } else {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    userId = data.user.id;
  }
  return userId;
}

export function getUserId() { return userId; }

// ---- id + code helpers -----------------------------------------------------

const uuid = () => crypto.randomUUID();

// Short, unambiguous join code (no O/0/I/1/L look-alikes).
function makeJoinCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

// ---- shape mapping: local model <-> relational rows ------------------------

function eventToRow(e, cid) {
  return {
    id: e.id, campaign_id: cid, name: e.name, x: e.x, y: e.y,
    session: e.session, type: e.type, canon: e.canon || '',
    slots: e.slots || [], hidden: !!e.hidden,
    reveal_session: e.revealSession ?? null, updated_at: new Date().toISOString(),
  };
}

function rowToEvent(r) {
  return {
    id: r.id, name: r.name, x: r.x, y: r.y, session: r.session, type: r.type,
    canon: r.canon || '', slots: r.slots || [], hidden: !!r.hidden,
    revealSession: r.reveal_session ?? null,
  };
}

// Turn the in-memory campaign into a publish payload, remapping local ids to uuids so
// the cloud copy has proper uuid keys. Returns { payload, newState } — newState is the
// same campaign re-keyed and marked cloud-backed, to become `current` after publish.
export function toPublishPayload(state) {
  const remoteId = uuid();
  const joinCode = makeJoinCode();
  const pMap = new Map(state.players.map(p => [p.id, uuid()]));
  const eMap = new Map(state.events.map(e => [e.id, uuid()]));

  const players = state.players.map(p => ({ id: pMap.get(p.id), name: p.name, color: p.color }));
  const events = state.events.map(e => ({
    id: eMap.get(e.id), name: e.name, x: e.x, y: e.y, session: e.session, type: e.type,
    canon: e.canon || '', slots: (e.slots || []).map(pid => pMap.get(pid)).filter(Boolean),
    hidden: !!e.hidden, reveal_session: e.revealSession ?? null,
  }));

  const testimony = [];
  for (const [eid, byPlayer] of Object.entries(state.testimony || {})) {
    for (const [pid, t] of Object.entries(byPlayer)) {
      if (!eMap.get(eid) || !pMap.get(pid)) continue;
      testimony.push({ id: uuid(), event_id: eMap.get(eid), player_id: pMap.get(pid), text: t.text });
    }
  }

  const warbands = [];
  for (const [pid, wb] of Object.entries(state.warbands || {})) {
    if (!pMap.get(pid)) continue;
    warbands.push({ id: uuid(), player_id: pMap.get(pid), text: wb.current || '', snapshots: wb.snapshots || [] });
  }

  const map = state.map ? { w: state.map.w, h: state.map.h, path: remoteId + '/map' } : null;

  const payload = {
    id: remoteId, name: state.name, join_code: joinCode,
    current_session: state.currentSession, concluded: !!state.concluded,
    sealing: state.sealing, grid: state.grid, map, players, events, testimony, warbands,
  };

  // Re-key the local copy so ids line up with the cloud from here on — including the
  // campaign's own id, so every device (owner + joiners) shares one id space.
  const newState = JSON.parse(JSON.stringify(state));
  newState.id = remoteId;
  newState.players = state.players.map(p => ({ ...p, id: pMap.get(p.id) }));
  newState.events = events.map(rowToEvent);
  newState.testimony = {};
  for (const t of testimony) {
    (newState.testimony[t.event_id] ||= {})[t.player_id] = { text: t.text, updatedAt: Date.now() };
  }
  newState.warbands = {};
  for (const w of warbands) newState.warbands[w.player_id] = { current: w.text, snapshots: w.snapshots };
  if (newState.map) newState.map.path = map.path;      // keep local imageId for the blob
  newState.cloud = { remoteId, joinCode };

  return { payload, newState, remoteId, joinCode, pMap };
}

// ---- publish / join / claim ------------------------------------------------

// Publish the current local campaign to the cloud. Uploads the map blob (if any),
// then calls the atomic publish RPC. Returns { remoteId, joinCode, newState }.
export async function publish(state, mapBlob) {
  await init();
  const { payload, newState, remoteId, joinCode } = toPublishPayload(state);
  const { error } = await client.rpc('publish_campaign', { payload });
  if (error) throw error;
  if (mapBlob && payload.map) {
    const up = await client.storage.from('maps').upload(payload.map.path, mapBlob, { upsert: true, contentType: mapBlob.type || 'image/*' });
    if (up.error) throw up.error;
  }
  return { remoteId, joinCode, newState };
}

// Join a campaign by its shared code. Returns the remote campaign id.
export async function joinByCode(code) {
  await init();
  const { data, error } = await client.rpc('join_campaign', { code: code.trim().toUpperCase() });
  if (error) throw error;
  return data; // uuid
}

export async function claimSeat(playerId) {
  await init();
  const { error } = await client.rpc('claim_seat', { pid: playerId });
  if (error) throw error;
}

// The roster + owner, so a freshly-joined device can pick a seat before full load.
export async function fetchSeats(remoteId) {
  await init();
  const [{ data: players }, { data: camp }] = await Promise.all([
    client.from('players').select('id,name,color,claimed_by').eq('campaign_id', remoteId),
    client.from('campaigns').select('id,name,owner_id').eq('id', remoteId).single(),
  ]);
  return { players: players || [], campaign: camp, ownerIsMe: camp && camp.owner_id === userId };
}

// ---- full fetch (assemble local-shaped state from the cloud) ---------------

// Read the whole campaign the current identity is allowed to see and assemble it into
// the local state shape. Downloads the map blob into IndexedDB so the viewport is
// unchanged. Returns a state object ready to become `current`.
export async function fetchCampaign(remoteId) {
  await init();
  const [camp, players, events, testimony, warbands] = await Promise.all([
    client.from('campaigns').select('*').eq('id', remoteId).single(),
    client.from('players').select('*').eq('campaign_id', remoteId),
    client.from('events').select('*').eq('campaign_id', remoteId),
    client.from('testimony').select('*').eq('campaign_id', remoteId),
    client.from('warbands').select('*').eq('campaign_id', remoteId),
  ]);
  if (camp.error) throw camp.error;
  const c = camp.data;

  const state = {
    schema: 1, id: remoteId, name: c.name,
    createdAt: Date.parse(c.created_at) || Date.now(), updatedAt: Date.now(),
    currentSession: c.current_session, concluded: c.concluded, sealing: c.sealing,
    grid: c.grid, map: null, players: [], events: [], testimony: {}, warbands: {},
    cloud: { remoteId, joinCode: c.join_code },
  };

  state.players = (players.data || []).map(p => ({ id: p.id, name: p.name, color: p.color, claimedBy: p.claimed_by }));
  state.events = (events.data || []).map(rowToEvent);
  for (const t of testimony.data || []) {
    (state.testimony[t.event_id] ||= {})[t.player_id] = { text: t.text, updatedAt: Date.parse(t.updated_at) || Date.now() };
  }
  for (const w of warbands.data || []) {
    state.warbands[w.player_id] = { current: w.text || '', snapshots: w.snapshots || [] };
  }

  if (c.map && c.map.path) {
    try {
      const dl = await client.storage.from('maps').download(c.map.path);
      if (dl.data) {
        const imageId = 'img_' + remoteId;
        await db.putImage(imageId, dl.data);
        state.map = { imageId, w: c.map.w, h: c.map.h, path: c.map.path };
      }
    } catch { /* map optional; leave null if it can't be fetched */ }
  }
  return state;
}

// ---- realtime --------------------------------------------------------------

// Subscribe to any change on this campaign; `onChange` is called (debounced) so the
// caller can re-read via fetchCampaign. Returns an unsubscribe function.
export function subscribe(remoteId, onChange) {
  if (!client) return () => {};
  let timer = null;
  const ping = () => { clearTimeout(timer); timer = setTimeout(onChange, 150); };
  const tables = ['campaigns', 'players', 'events', 'testimony', 'warbands'];
  const ch = client.channel('hearsay:' + remoteId);
  for (const table of tables) {
    const filter = table === 'campaigns' ? `id=eq.${remoteId}` : `campaign_id=eq.${remoteId}`;
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, ping);
  }
  ch.subscribe();
  return () => { clearTimeout(timer); client.removeChannel(ch); };
}

// ---- write-through (called by state.js on cloud campaigns) -----------------
// All are fire-and-forget from the caller's view but throw on error so it can surface.

export async function pushEvent(remoteId, event) {
  const { error } = await client.from('events').upsert(eventToRow(event, remoteId));
  if (error) throw error;
}
export async function pushEventDelete(id) {
  const { error } = await client.from('events').delete().eq('id', id);
  if (error) throw error;
}
export async function pushTestimony(remoteId, eventId, playerId, text) {
  if (!text) {
    const { error } = await client.from('testimony').delete().eq('event_id', eventId).eq('player_id', playerId);
    if (error) throw error;
    return;
  }
  const { error } = await client.from('testimony').upsert(
    { campaign_id: remoteId, event_id: eventId, player_id: playerId, text, updated_at: new Date().toISOString() },
    { onConflict: 'event_id,player_id' });
  if (error) throw error;
}
export async function pushWarband(remoteId, playerId, current, snapshots) {
  const { error } = await client.from('warbands').upsert(
    { campaign_id: remoteId, player_id: playerId, text: current, snapshots, updated_at: new Date().toISOString() },
    { onConflict: 'player_id' });
  if (error) throw error;
}
export async function pushCampaignMeta(remoteId, patch) {
  const { error } = await client.from('campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', remoteId);
  if (error) throw error;
}
export async function pushPlayer(remoteId, player) {
  const { error } = await client.from('players').insert({ id: player.id, campaign_id: remoteId, name: player.name, color: player.color });
  if (error) throw error;
}
export async function pushMap(remoteId, blob, w, h) {
  const path = remoteId + '/map';
  const up = await client.storage.from('maps').upload(path, blob, { upsert: true, contentType: blob.type || 'image/*' });
  if (up.error) throw up.error;
  const { error } = await client.from('campaigns').update({ map: { w, h, path }, updated_at: new Date().toISOString() }).eq('id', remoteId);
  if (error) throw error;
}
