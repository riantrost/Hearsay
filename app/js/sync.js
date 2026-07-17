// sync.js — connects a local-first campaign to a table server. Local IndexedDB
// stays the source of truth for this device; the server is where the table's
// devices meet. The shape is deliberately simple and re-entrant instead of
// clever: every sync = push the rows THIS SEAT owns, then pull everything the
// server will show this seat and let it win. Authority-by-layer makes that
// safe — canon rows have one author (the owner), testimony/warband rows have
// one author (their player) — so real conflicts barely exist by construction.
//
// No websockets: a campaign syncs when opened, when the tab regains focus, on
// every local mutation (coalesced), and on demand. Sessions are the clock;
// nobody needs sub-second latency from a campaign journal.

import * as S from './state.js';
import { db } from './db.js';
import { Remote, makeInvite, parseInvite } from './remote.js';
import { toast } from './ui.js';

export { makeInvite, parseInvite };

let applying = false;          // true while a pull is being merged (hook must skip)
let pushTimer = null;
const lastSyncAt = {};         // campaignId -> ms, throttles focus-triggered syncs
const uploadedImages = new Set(); // imageIds pushed this app-lifetime (server upserts anyway)

const iso = (ms) => new Date(ms || Date.now()).toISOString();
const ms = (isoStr) => (isoStr ? new Date(isoStr).getTime() : 0);
const enc = encodeURIComponent;

export function isConnected(state) { return !!state?.remote?.url; }

// ---- mutation hook (registered from app.js) ---------------------------------
// Every local mutation on a connected campaign schedules a push. Unlike local
// persistence this IS coalesced — a lost push self-heals on the next sync, so
// batching bursts costs nothing but a little latency.

export function onMutation(state) {
  if (!isConnected(state) || applying) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushMine(state).catch(() => markDirty(state));
  }, 800);
}

function markDirty(state) {
  if (!state.remote || state.remote.dirty) return;
  state.remote.dirty = true;
  db.putCampaign(state); // direct write: not a mutation, just a sync bookmark
}

// ---- push: the rows this seat owns -------------------------------------------

async function pushMine(state) {
  const r = new Remote(state.remote);
  const seat = S.getIdentity(state.id);
  const cid = state.id;

  if (seat === 'owner') {
    await r.patch('campaigns', `id=eq.${enc(cid)}`, {
      name: state.name,
      current_session: state.currentSession,
      concluded: state.concluded,
      sealing: state.sealing,
      grid: state.grid,
      map: state.map,
      updated_at: iso(state.updatedAt),
    });
    await r.upsert('players', state.players.map((p, i) => ({
      campaign_id: cid, id: p.id, name: p.name, color: p.color, sort: i,
    })));
    await r.upsert('events', state.events.map(e => ({
      campaign_id: cid, id: e.id, name: e.name, x: e.x, y: e.y,
      session: e.session, type: e.type, canon: e.canon, slots: e.slots,
      hidden: e.hidden, reveal_session: e.revealSession,
      proposed_by: e.proposedBy ?? null, updated_at: iso(e.updatedAt),
    })));
    // Deletions propagate by absence: what the owner's device no longer has,
    // the table no longer has. (Canon has exactly one author, so this is safe.)
    const keep = state.events.map(e => `"${e.id}"`).join(',');
    await r.remove('events', `campaign_id=eq.${enc(cid)}` + (keep ? `&id=not.in.(${keep})` : ''));
    if (state.map?.imageId && !uploadedImages.has(state.map.imageId)) {
      const blob = await db.getImage(state.map.imageId);
      if (blob) {
        await r.uploadObject('maps', `${cid}/${state.map.imageId}`, blob);
        uploadedImages.add(state.map.imageId);
      }
    }
  } else if (seat) {
    const mine = [];
    for (const [eventId, byPlayer] of Object.entries(state.testimony)) {
      const t = byPlayer[seat];
      if (t && t.text != null) mine.push({
        campaign_id: cid, event_id: eventId, player_id: seat,
        text: t.text, updated_at: iso(t.updatedAt),
      });
    }
    await r.upsert('testimony', mine);
    const keep = mine.map(t => `"${t.event_id}"`).join(',');
    await r.remove('testimony', `campaign_id=eq.${enc(cid)}&player_id=eq.${enc(seat)}`
      + (keep ? `&event_id=not.in.(${keep})` : ''));
    const wb = state.warbands[seat];
    if (wb) {
      await r.upsert('warbands', [{ campaign_id: cid, player_id: seat, current: wb.current || '', updated_at: iso(state.updatedAt) }]);
      await r.upsert('warband_snapshots', (wb.snapshots || []).map(s => ({
        campaign_id: cid, player_id: seat, session: s.session, text: s.text, at: iso(s.at),
      })));
    }
  }
  if (state.remote.dirty) { delete state.remote.dirty; db.putCampaign(state); }
}

// ---- pull: everything the server shows this seat ------------------------------
// Server wins. For a player that's the whole point (hidden pins never arrived,
// sealed words never arrived); for the owner it's safe because pushMine ran
// first. Returns true when anything visible changed.

async function pullAll(state) {
  const r = new Remote(state.remote);
  const cid = state.id;
  const q = `campaign_id=eq.${enc(cid)}`;

  const [rows, players, events, testimony, warbands, snaps, meta] = await Promise.all([
    r.select('campaigns', `id=eq.${enc(cid)}`),
    r.select('players', q + '&order=sort'),
    r.select('events', q),
    r.select('testimony', q),
    r.select('warbands', q),
    r.select('warband_snapshots', q + '&order=session'),
    r.rpc('testimony_meta', { cid }),
  ]);
  const c = rows[0];
  if (!c) throw new Error('campaign missing on server');

  const before = JSON.stringify([state.name, state.currentSession, state.concluded, state.sealing,
    state.grid, state.map, state.players, state.events, state.testimony, state.warbands]);

  applying = true;
  try {
    state.name = c.name;
    state.currentSession = c.current_session;
    state.concluded = c.concluded;
    state.sealing = c.sealing;
    state.grid = c.grid || state.grid;
    state.map = c.map || null;

    state.players = players.map(p => ({ id: p.id, name: p.name, color: p.color }));
    state.events = events.map(e => ({
      id: e.id, name: e.name, x: e.x, y: e.y, session: e.session, type: e.type,
      canon: e.canon, slots: e.slots || [], hidden: e.hidden,
      revealSession: e.reveal_session, proposedBy: e.proposed_by || undefined,
      updatedAt: ms(e.updated_at),
    }));

    const t = {};
    for (const row of testimony) {
      (t[row.event_id] ||= {})[row.player_id] = { text: row.text, updatedAt: ms(row.updated_at) };
    }
    // Sealed words don't arrive, but their existence does: keep the pin's
    // completeness ring honest with word-less placeholder entries.
    for (const m of (meta || [])) {
      if (!t[m.event_id]?.[m.player_id]) {
        (t[m.event_id] ||= {})[m.player_id] = { sealed: true, updatedAt: ms(m.updated_at) };
      }
    }
    state.testimony = t;

    const wb = {};
    for (const row of warbands) wb[row.player_id] = { current: row.current, snapshots: [] };
    for (const s of snaps) {
      (wb[s.player_id] ||= { current: '', snapshots: [] }).snapshots.push({
        session: s.session, text: s.text, at: ms(s.at),
      });
    }
    state.warbands = wb;

    if (state.map?.imageId && !(await db.getImage(state.map.imageId))) {
      const blob = await r.downloadObject('maps', `${cid}/${state.map.imageId}`);
      if (blob) await db.putImage(state.map.imageId, blob);
    }
    S.commit();
  } finally {
    applying = false;
  }

  return before !== JSON.stringify([state.name, state.currentSession, state.concluded, state.sealing,
    state.grid, state.map, state.players, state.events, state.testimony, state.warbands]);
}

// ---- the one entry point -------------------------------------------------------

export async function syncNow(state, { quiet = false, minInterval = 0 } = {}) {
  if (!isConnected(state)) return false;
  if (minInterval && Date.now() - (lastSyncAt[state.id] || 0) < minInterval) return false;
  try {
    await pushMine(state);
    const changed = await pullAll(state);
    lastSyncAt[state.id] = Date.now();
    return changed;
  } catch (err) {
    markDirty(state);
    if (!quiet) toast('Could not reach the table server — changes are safe locally and will sync next time.');
    return false;
  }
}

// ---- publish / join / seats ------------------------------------------------------

export async function publishCampaign(state, { url, anonKey }) {
  const r = new Remote({ url, anonKey });
  await r.ensureAuth();
  let row;
  try {
    row = await r.rpc('create_campaign', { p: {
      id: state.id, name: state.name, currentSession: state.currentSession,
      concluded: state.concluded, sealing: state.sealing, grid: state.grid, map: state.map,
    } });
  } catch (err) {
    // Already published (e.g. from this device, earlier): if this user is its
    // owner the campaign row is visible — reuse its invite code.
    const existing = await r.select('campaigns', `id=eq.${enc(state.id)}`).catch(() => []);
    if (!existing[0]) throw err;
    row = existing[0];
  }
  state.remote = { url: r.url, anonKey, code: row.invite_code };
  localStorage.setItem('hearsay.server', JSON.stringify({ url: r.url, anonKey }));
  await pushMine(state);
  S.commit();
  return makeInvite(state.remote);
}

export async function joinCampaign(inviteText) {
  const parsed = parseInvite(inviteText);
  if (!parsed) throw new Error('That doesn’t look like an invite. Ask the owner to copy it from "Table & invite".');
  const r = new Remote(parsed);
  await r.ensureAuth();
  const c = await r.rpc('join_campaign', { code: parsed.code });
  let state = await db.getCampaign(c.id);
  if (!state) {
    state = {
      schema: 1, id: c.id, name: c.name,
      createdAt: Date.now(), updatedAt: 0,
      currentSession: c.current_session, concluded: c.concluded, sealing: c.sealing,
      grid: c.grid, map: c.map, players: [], events: [], testimony: {}, warbands: {},
    };
  }
  state.remote = { url: r.url, anonKey: parsed.anonKey, code: parsed.code };
  await db.putCampaign(state);
  return c.id;
}

// Claiming a seat on a connected campaign also records it on the server, so
// RLS knows which rows this device may write. The local pick still applies if
// the server can't be reached; writes simply won't land until it can.
export async function claimSeat(state, seatId) {
  if (!isConnected(state) || seatId === 'owner') return;
  const r = new Remote(state.remote);
  await r.ensureAuth();
  await r.patch('members', `campaign_id=eq.${enc(state.id)}&user_id=eq.${enc(r.userId)}`, { seat: seatId });
}
